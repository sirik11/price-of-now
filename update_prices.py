"""
Refresh prices.json from the AWS Price List API (public, no credentials needed).

    python3 update_prices.py            # us-east-1
    python3 update_prices.py eu-west-1  # usage types are prefixed per region; see REGION_PREFIX

Only the usage types the cost model needs are kept, each with the price AWS publishes
and the publication date of the offer file it came from.
"""
import json
import sys
import urllib.request

URL = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/{svc}/current/{region}/index.json"
REGION_PREFIX = {"us-east-1": "USE1-", "us-east-2": "USE2-", "us-west-2": "USW2-", "eu-west-1": "EU-"}

# name in prices.json -> (service, usage type without the region prefix, first tier only)
WANTED = {
    "kds_shard_hour": ("AmazonKinesis", "Storage-ShardHour"),
    "kds_put_payload_unit": ("AmazonKinesis", "PutRequestPayloadUnits"),
    "kds_od_stream_hour": ("AmazonKinesis", "OnDemand-StreamHour"),
    "kds_od_in_gb": ("AmazonKinesis", "OnDemand-BilledIncomingBytes"),
    "kds_od_out_gb": ("AmazonKinesis", "OnDemand-BilledOutgoingBytes"),
    "kds_oda_in_gb": ("AmazonKinesis", "Advantage-BilledIncomingBytes"),
    "kds_oda_out_gb": ("AmazonKinesis", "Advantage-BilledOutgoingBytes"),
    "firehose_in_gb": ("AmazonKinesisFirehose", "BilledBytes"),
    "flink_kpu_hour": ("AmazonKinesisAnalytics", "KPU-Hour-Java"),
    "flink_storage_gb_month": ("AmazonKinesisAnalytics", "RunningApplicationStorage"),
    "msk_m7g_large_hour": ("AmazonMSK", "Kafka.m7g.large"),
    "msk_storage_gb_month": ("AmazonMSK", "Kafka.Storage.GP2"),
    "msk_express_m7g_large_hour": ("AmazonMSK", "Express.m7g.large"),
    "msk_express_in_gb": ("AmazonMSK", "Express.In-Bytes"),
    "msk_express_storage_gb_month": ("AmazonMSK", "Express.Storage"),
    "msk_sls_cluster_hour": ("AmazonMSK", "KafkaServerless-ClusterHours"),
    "msk_sls_partition_hour": ("AmazonMSK", "KafkaServerless-PartitionHours"),
    "msk_sls_in_gb": ("AmazonMSK", "KafkaServerless-In-Bytes"),
    "msk_sls_out_gb": ("AmazonMSK", "KafkaServerless-Out-Bytes"),
    "msk_sls_storage_gb_month": ("AmazonMSK", "KafkaServerless-StorageHours"),
    "lambda_request": ("AWSLambda", "Request-ARM"),
    "lambda_gb_second": ("AWSLambda", "Lambda-GB-Second-ARM"),
}
UNPREFIXED = {"AmazonKinesis", "AWSLambda"}  # these offer files use bare usage types in us-east-1


def first_tier(offer, usagetype):
    for sku, product in offer["products"].items():
        if product.get("attributes", {}).get("usagetype") != usagetype:
            continue
        for term in offer["terms"]["OnDemand"].get(sku, {}).values():
            for dim in term["priceDimensions"].values():
                if dim.get("beginRange", "0") == "0":
                    return float(dim["pricePerUnit"]["USD"]), dim["unit"], dim["description"]
    raise KeyError(usagetype)


def main(region="us-east-1"):
    offers, out = {}, {"region": region, "source": URL.format(svc="<service>", region=region), "prices": {}}
    for name, (svc, usage) in WANTED.items():
        if svc not in offers:
            with urllib.request.urlopen(URL.format(svc=svc, region=region)) as r:
                offers[svc] = json.load(r)
            out.setdefault("published", {})[svc] = offers[svc]["publicationDate"]
        full = usage if svc in UNPREFIXED and region == "us-east-1" else REGION_PREFIX[region] + usage
        price, unit, desc = first_tier(offers[svc], full)
        out["prices"][name] = {"usd": price, "unit": unit, "usagetype": full, "description": desc}
    with open("prices.json", "w") as f:
        json.dump(out, f, indent=2)
    print(f"wrote {len(out['prices'])} prices for {region}")


if __name__ == "__main__":
    main(*sys.argv[1:])
