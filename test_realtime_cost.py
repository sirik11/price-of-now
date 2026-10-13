"""Reproduces AWS's own worked pricing examples, then checks the model's edges. Run: python3 test_realtime_cost.py"""
import realtime_cost as rc

# AWS rounds intermediate GB/s figures in its examples, so allow 0.1%
close = lambda a, b, rel=0.001: abs(a - b) <= rel * b

# Kinesis Data Streams pricing page, On-demand Standard: 1,000 records/s of 3 KB, one consumer, 30 days
c = rc.kds_on_demand(rc.Workload(events=1000, size_bytes=3 * 1024))
assert close(c["data in"], 593.04) and close(c["data out"], 296.50) and close(c["stream-hours"], 28.80), c

# On-demand Advantage example 1: 3,000 records/s of 10 KB -> $2,373.05 in, $1,186.52 out
c = rc.kds_on_demand_advantage(rc.Workload(events=3000, size_bytes=10 * 1024))
assert close(c["data in (25 MB/s minimum)"], 2373.05) and close(c["data out (25 MB/s minimum)"], 1186.52), c

# On-demand Advantage example 2: below the 25 MB/s minimum, billed as if at it -> $2,025.00 + $1,012.50
c = rc.kds_on_demand_advantage(rc.Workload(events=1000, size_bytes=10 * 1024))
assert close(c["data in (25 MB/s minimum)"], 2025.00) and close(c["data out (25 MB/s minimum)"], 1012.50), c

# Provisioned example: 100 records/s of 35 KB -> 4 shards, 2 PUT payload units per record (AWS uses a 31-day month)
c = rc.kds_provisioned(rc.Workload(events=100, size_bytes=35 * 1024))
assert "shard-hours (4 shards)" in c and close(c["shard-hours (4 shards)"] * 31 / 30, 44.64), c
assert close(c["PUT payload units"] * 31 / 30, 7.499), c

# Firehose pricing page: 100 records/s of 3 KB, billed as 5 KB -> 1,235.96 GB, $35.84
c = rc.firehose_s3(rc.Workload(events=100, size_bytes=3 * 1024))
assert close(c["firehose ingestion"], 35.84), c

# Rounding is the multiplier: a 500-byte event is billed as 1 KB by Kinesis on-demand and 5 KB by Firehose
w = rc.Workload(events=2000, size_bytes=500)
assert close(rc.firehose_s3(w)["firehose ingestion"] / (w.raw_gb * rc.P["firehose_in_gb"]), 5 * 1024 / 500)
# ...and producer batching removes it: 10 events per 5,000-byte record
assert rc.firehose_s3(rc.Workload(2000, 500, batch=10))["firehose ingestion"] < rc.firehose_s3(w)["firehose ingestion"] / 9

# Shard count is the max of the record, ingress, and egress limits
assert "shard-hours (2 shards)" in rc.kds_provisioned(w)                  # 2,000 records/s -> 2 shards
assert "shard-hours (1 shards)" in rc.kds_provisioned(rc.Workload(2000, 500, batch=10))

# Every architecture returns a positive monthly cost
for tier, name, cost in rc.estimate(w):
    assert sum(cost.values()) > 0, name

rc.main([])
print("\nall checks pass")
