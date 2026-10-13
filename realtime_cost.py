"""
realtime_cost: what one event stream costs on AWS, by how fresh the answer has to be.

    python3 realtime_cost.py                          # 2,000 events/s of 500 bytes, one consumer
    python3 realtime_cost.py --events 5000 --bytes 2000 --consumers 2
    python3 realtime_cost.py --batch 10               # producer packs 10 events per record

Prices come from prices.json (AWS Price List API, refresh with update_prices.py).
Billing rules follow AWS's pricing pages, and test_realtime_cost.py reproduces AWS's own
worked examples to the cent. Month = 30 days, GB = 1,048,576 KB, as in those examples.

What it leaves out on purpose: data transfer between AZs or to the internet, the query
or storage layer after the stream (S3, Athena, OpenSearch), free tiers, and headroom.
Every architecture is costed at the smallest size that carries the load.
"""
import argparse
import json
import math
from pathlib import Path

HOURS = 720                     # 30-day month
SECONDS = HOURS * 3600
KB_PER_GB = 1024 * 1024

P = {k: v["usd"] for k, v in json.loads((Path(__file__).parent / "prices.json").read_text())["prices"].items()}


def gb_month(records_per_s, billed_kb_per_record):
    return records_per_s * billed_kb_per_record * SECONDS / KB_PER_GB


def ceil_to(kb, step):
    return math.ceil(kb / step) * step


class Workload:
    def __init__(self, events=2000, size_bytes=500, consumers=1, batch=1, retention_hours=24):
        self.events, self.size, self.consumers, self.batch = events, size_bytes, consumers, batch
        self.retention_hours = retention_hours
        self.records = events / batch                    # records per second after producer batching
        self.record_kb = batch * size_bytes / 1024       # KB per record
        self.raw_gb = gb_month(self.records, self.record_kb)  # what was actually sent, per month
        self.mb_s = self.records * self.record_kb / 1024   # MB/s as AWS counts it (1 MB = 1,024 KB)


def lambda_consumer(w, invocations_per_s, memory_gb=0.5, seconds=0.1):
    """A small Lambda that processes each batch: ARM, 512 MB, 100 ms per invocation."""
    n = invocations_per_s * SECONDS
    return n * P["lambda_request"] + n * memory_gb * seconds * P["lambda_gb_second"]


def firehose_s3(w):
    """Firehose Direct PUT to S3. Ingestion billed in 5 KB increments per record."""
    gb = gb_month(w.records, ceil_to(w.record_kb, 5))
    return {"firehose ingestion": gb * P["firehose_in_gb"]}


def kds_provisioned(w):
    """Kinesis Data Streams, provisioned shards, read by Lambda. 1 MB/s or 1,000 records/s in per shard, 2 MB/s out."""
    shards = max(1, math.ceil(w.records / 1000), math.ceil(w.mb_s / 1.0), math.ceil(w.mb_s * w.consumers / 2.0))
    units = w.records * math.ceil(w.record_kb / 25) * SECONDS          # PUT payload units, 25 KB chunks
    return {f"shard-hours ({shards} shards)": shards * HOURS * P["kds_shard_hour"],
            "PUT payload units": units * P["kds_put_payload_unit"],
            "Lambda consumer": lambda_consumer(w, max(shards, w.records / 100)) * w.consumers}


def kds_on_demand(w):
    """Kinesis Data Streams, On-demand Standard. Records billed rounded up to the nearest 1 KB."""
    gb_in = gb_month(w.records, ceil_to(w.record_kb, 1))
    return {"data in": gb_in * P["kds_od_in_gb"],
            "data out": gb_in * w.consumers * P["kds_od_out_gb"],
            "stream-hours": HOURS * P["kds_od_stream_hour"],
            "Lambda consumer": lambda_consumer(w, max(4, w.records / 100)) * w.consumers}


def kds_on_demand_advantage(w):
    """On-demand Advantage: cheaper per GB, but billed for at least 25 MB/s in and out, account-wide."""
    floor = gb_month(25, 1024)                          # 25 MB/s for a month, in GB
    gb_in = gb_month(w.records, ceil_to(w.record_kb, 1))
    return {"data in (25 MB/s minimum)": max(gb_in, floor) * P["kds_oda_in_gb"],
            "data out (25 MB/s minimum)": max(gb_in * w.consumers, floor) * P["kds_oda_out_gb"],
            "Lambda consumer": lambda_consumer(w, max(4, w.records / 100)) * w.consumers}


def flink(w, kpus=1):
    """Managed Service for Apache Flink on top of a stream: KPUs + 1 orchestration KPU + 50 GB storage per KPU."""
    return {f"Flink ({kpus} KPU + 1 orchestration)": (kpus + 1) * HOURS * P["flink_kpu_hour"],
            "Flink running storage": kpus * 50 * P["flink_storage_gb_month"]}


def kds_provisioned_flink(w):
    cost = kds_provisioned(w)
    cost.pop("Lambda consumer")
    return {**cost, **flink(w)}


def msk_serverless(w, partitions=6):
    stored_gb = w.raw_gb / HOURS * w.retention_hours     # data held at any moment, as GB-months
    return {"cluster-hours": HOURS * P["msk_sls_cluster_hour"],
            f"partition-hours ({partitions})": partitions * HOURS * P["msk_sls_partition_hour"],
            "data in": w.raw_gb * P["msk_sls_in_gb"],
            "data out": w.raw_gb * w.consumers * P["msk_sls_out_gb"],
            "storage": stored_gb * P["msk_sls_storage_gb_month"]}


def msk_provisioned(w, brokers=3):
    stored_gb = 3 * w.raw_gb / HOURS * w.retention_hours  # replication factor 3, on EBS
    return {f"brokers ({brokers} x kafka.m7g.large)": brokers * HOURS * P["msk_m7g_large_hour"],
            "storage (RF 3)": stored_gb * P["msk_storage_gb_month"]}


def msk_express(w, brokers=3):
    stored_gb = w.raw_gb / HOURS * w.retention_hours
    return {f"brokers ({brokers} x express.m7g.large)": brokers * HOURS * P["msk_express_m7g_large_hour"],
            "data in": w.raw_gb * P["msk_express_in_gb"],
            "storage": stored_gb * P["msk_express_storage_gb_month"]}


# freshness tier, label, model
ARCHITECTURES = [
    ("minutes", "Firehose to S3", firehose_s3),
    ("~1 second", "Kinesis provisioned + Lambda", kds_provisioned),
    ("~1 second", "Kinesis on-demand + Lambda", kds_on_demand),
    ("~1 second", "Kinesis on-demand Advantage + Lambda", kds_on_demand_advantage),
    ("seconds, stateful", "Kinesis provisioned + Flink", kds_provisioned_flink),
    ("sub-second", "MSK provisioned (3 brokers)", msk_provisioned),
    ("sub-second", "MSK Express (3 brokers)", msk_express),
    ("sub-second", "MSK Serverless", msk_serverless),
]


def estimate(w):
    return [(tier, name, fn(w)) for tier, name, fn in ARCHITECTURES]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--events", type=float, default=2000, help="events per second (default 2000)")
    ap.add_argument("--bytes", type=int, default=500, help="average event size in bytes (default 500)")
    ap.add_argument("--consumers", type=int, default=1, help="applications reading the stream (default 1)")
    ap.add_argument("--batch", type=int, default=1, help="events packed into one record by the producer (default 1)")
    ap.add_argument("--detail", action="store_true", help="show each line item")
    ap.add_argument("--json", action="store_true", help="print the estimate as JSON")
    a = ap.parse_args(argv)
    w = Workload(a.events, a.bytes, a.consumers, a.batch)
    if a.json:
        print(json.dumps([{"freshness": t, "route": n, "monthly": round(sum(c.values()), 2),
                           "items": {k: round(v, 2) for k, v in c.items()}} for t, n, c in estimate(w)], indent=2))
        return
    print(f"{a.events:,.0f} events/s x {a.bytes:,} B = {w.mb_s:.2f} MB/s, {w.raw_gb:,.0f} GB/month sent, "
          f"{a.consumers} consumer(s), {a.batch} event(s) per record. us-east-1, 30-day month.\n")
    for tier, name, cost in estimate(w):
        print(f"  {tier:<18} {name:<38} ${sum(cost.values()):>10,.2f}/month")
        if a.detail:
            for item, usd in cost.items():
                print(f"  {'':<18}   {item:<36} ${usd:>10,.2f}")
    print("\nExcludes cross-AZ and internet data transfer, the query/storage layer, free tiers, and headroom.")


if __name__ == "__main__":
    main()
