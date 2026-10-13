# The Price of Now

*"Real-time is expensive" is mostly a myth on AWS. I priced one event stream eight ways, and the bill was driven by record sizes, convenience, and minimum charges, not by how fresh the data was.*

![Cover image styled as a railway departure board with a station clock, titled The Price of Now: one event stream, eight ways to run it on AWS. Rows list freshness, route, and monthly fare: Firehose to S3, minutes, 717 dollars; Kinesis provisioned, about one second, 139 dollars; Kinesis on-demand, about one second, 667 dollars; MSK Serverless, under a second, 917 dollars.](../figures/cover-the-price-of-now.png)

Someone asks whether a dashboard can be real-time, and someone else says that will be expensive. Usually nobody prices it. Teams settle on a batch pipeline that refreshes every few minutes, on the assumption that fresher data costs more.

I wanted to know where the money actually goes, so I took one realistic stream and priced it eight ways on AWS, from "a few minutes late" to "under a second." The result surprised me: the option most teams pick to save money was one of the most expensive on the board.

## What did I price?

One stream, held constant across every option:

- **2,000 events per second, 500 bytes each.** Clickstream, IoT telemetry, and application events often look like this. That's about 0.95 MB/s, or 2.4 TB a month.
- **One application reading it**, 24 hours of retention, us-east-1, a 30-day month.
- **Prices from the [AWS Price List API](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-the-aws-price-list-bulk-api.html)**, offer files published September 11, 2026, with billing rules taken from each service's pricing page.

To keep myself honest, the model reproduces AWS's own worked examples from the [Kinesis Data Streams](https://aws.amazon.com/kinesis/data-streams/pricing/) and [Firehose](https://aws.amazon.com/firehose/pricing/) pricing pages to within 0.1%. It leaves out cross-AZ data transfer, the query layer after the stream, free tiers, and headroom, so every option is priced at the smallest size that carries the load.

![Departure board of eight ways to run the same stream, with freshness and monthly fare: Firehose to S3, minutes, $717; Kinesis provisioned with Lambda, about 1 second, $139; Kinesis on-demand, about 1 second, $667; Kinesis on-demand Advantage, about 1 second, $3,082; Kinesis with Flink, seconds with state, $258; MSK provisioned, under 1 second, $465; MSK Express, $913; MSK Serverless, $917.](../figures/fig1-departure-board.png)

## Why did "a few minutes late" cost the most?

The usual way to land a stream in S3 for analytics is [Amazon Data Firehose](https://aws.amazon.com/firehose/pricing/). By default it buffers for 300 seconds before writing, so the data is minutes old. It's the option teams pick precisely because it isn't "real-time."

For this stream, it costs $717 a month. A Kinesis data stream with a Lambda consumer delivers the same events in about a second for $139.

Most of that gap is one line on the pricing page. Firehose ingestion for Direct PUT and Kinesis sources is "billed per GB ingested in 5KB increments." A 500-byte event is billed as 5 KB. You pay for ten times the data you sent.

![Four boxes drawn to scale against a 500-byte event, shown as a small parcel. Sent: 500 bytes, one times. Kinesis on-demand rounds it up to 1 KB, two times. Firehose bills it in 5 KB increments, ten times, so the parcel sits in a mostly empty box. Firehose with ten events packed into one record fills the same 5 KB box, about one times. A note adds that provisioned Kinesis charges per 25 KB PUT payload unit.](../figures/fig2-billed-vs-sent.png)

Kinesis rounds too, just less. [On-demand mode](https://aws.amazon.com/kinesis/data-streams/pricing/) bills each record "rounded up to the nearest 1 KB," so a 500-byte event is billed as 1 KB. Provisioned mode charges per 25 KB "PUT payload unit," which a 500-byte record fills about a fiftieth of.

The fix is on the producer, and it's cheap: pack several events into one record. With ten events per record, the same stream costs $72 a month through Firehose and $23 through provisioned Kinesis. The Kinesis Producer Library calls this aggregation; for Firehose, it can be as simple as writing newline-delimited JSON in batches.

Even batched, Firehose costs about three times as much as a busy provisioned stream. That's not quite a like-for-like comparison: Firehose writes the data to S3 for you, while the Kinesis options only hand events to your code. But it means "slow" was never the cheap choice here.

If your events are small, this matters more than any choice of service.

## What does convenience cost?

Kinesis Data Streams has three capacity modes, and for this stream they span more than a factor of twenty.

**Provisioned** costs $139 including the Lambda consumer. You choose the number of shards, each taking up to 1 MB/s or 1,000 records per second, and you pay $0.015 per shard-hour. Two shards cover this stream.

**On-demand Standard** costs $667. You never think about shards: you pay $0.08 per GB written, $0.04 per GB read, and $0.04 per stream-hour. For a steady stream, that's almost five times the provisioned price. The premium buys automatic scaling, which is worth paying for when traffic is spiky or unknown. For a steady stream, it's a lot to pay for something you'll rarely use.

**On-demand Advantage** costs $3,082, which looks like a mistake until you read the terms. It's much cheaper per GB, $0.032 in and $0.016 out, but there's "a minimum charge of 25MB/s data ingested and 25MB/s data retrieved at the account level." That floor is $3,037.50 a month before you send anything. By my math it beats On-demand Standard only above roughly 10 MB/s of steady traffic with one consumer.

## Where does real-time actually cost money?

When freshness does get expensive, it's through minimum charges, not per-event prices.

![Bar chart of the monthly minimum each option charges before any data flows: Firehose, zero; Kinesis provisioned, 10.80 dollars per shard; Kinesis on-demand Standard, 28.80 dollars per stream; Managed Service for Apache Flink, 163.40 dollars per application; MSK provisioned with three brokers, 440.64 dollars; MSK Serverless, 540 dollars per cluster; MSK Express with three brokers, 881.28 dollars; Kinesis on-demand Advantage, 3,037.50 dollars per account.](../figures/fig3-minimum-fares.png)

**Stateful processing.** Windowed aggregations, joins, and deduplication usually mean [Managed Service for Apache Flink](https://aws.amazon.com/managed-service-apache-flink/pricing/). You pay $0.11 per KPU-hour, and every application is "charged a single additional KPU per application, used for orchestration," plus 50 GB of running storage per KPU. The smallest application costs about $163 a month, and that's per application, not per pipeline.

**Kafka.** [Amazon MSK](https://aws.amazon.com/msk/pricing/) is priced by the cluster, not the event. Three standard `kafka.m7g.large` brokers cost $441 a month before storage. Express brokers cost $881. MSK Serverless charges $0.75 per cluster-hour, which is $540 a month at zero traffic. At this stream's volume, all three cost more than provisioned or on-demand Kinesis. They start to make sense when you already run Kafka, have many consumers, or push far more data than this.

So the real price of "now" isn't per event. It's the fixed cost of the machinery that keeps state or runs a cluster, and it's paid whether the stream is busy or idle.

## Which one should you choose?

Start from what the answer is for, not from the word "real-time."

![Transit-style route map for choosing a streaming option. The line starts at a question: who acts on the data? If a person checks a dashboard every few minutes, take Firehose to S3 with batched records. If a system reacts within seconds, take Kinesis: provisioned for steady traffic, on-demand for spiky or unknown traffic. If you need windows, joins, or state, add Flink and budget per application. If you already run Kafka or need many consumers at high volume, take MSK.](../figures/fig4-route-map.png)

- **A person looks at it every few minutes.** Minutes is fine. Use Firehose to S3, and batch your records before you send them.
- **A system acts on it within seconds**, like an alert, a fraud check, or a recommendation. Use Kinesis Data Streams: provisioned if traffic is steady, on-demand if it's spiky or you don't know yet. Batch here too.
- **You need state across events**, like windows, joins, or deduplication. Add Flink, and budget roughly $163 a month per application before any real work.
- **You already run Kafka**, or need many independent consumers at high volume. Use MSK, and accept the cluster floor.

The one choice that rarely makes sense is the one people make by default: a slow pipeline chosen to save money, sending small unbatched records into a service that bills them as large ones.

## How do you price your own stream?

Your numbers will differ, so I published the model as [a small calculator](https://github.com/sirik11/price-of-now). It's one Python file with no dependencies, it loads prices from the AWS Price List API, and its tests reproduce AWS's own pricing examples. Give it your event rate, event size, number of consumers, and batching, and it prints the monthly cost of each option with every line item.

![Calculator output printed as a station ticket receipt for 2,000 events per second of 500 bytes. Fares per month: Firehose to S3, 716.86 dollars; Kinesis provisioned with Lambda, 139.10; Kinesis on-demand with Lambda, 666.99; Kinesis on-demand Advantage, 3,082.43; Kinesis with Flink, 257.58; MSK provisioned, 464.78; MSK Express, 913.47; MSK Serverless, 916.62.](../figures/receipt.png)

Two caveats. The calculator doesn't price data transfer between Availability Zones, which matters for Kafka clients, and it doesn't price whatever you query the data with afterward. And provisioned capacity needs headroom for spikes, so add a shard or two before you compare it with on-demand.

## What does "now" actually cost?

On AWS, getting data in a second instead of five minutes is not what makes a pipeline expensive. Small records billed as big ones, capacity modes that charge for convenience you don't need, and minimum fees for machinery you may not use: that's where the money goes.

So the next time someone says real-time is too expensive, ask which part. Then price it.

*The calculator, its tests, and every figure in this piece are open source on GitHub: [sirik11/price-of-now](https://github.com/sirik11/price-of-now).*

## Sources

- [Amazon Kinesis Data Streams pricing](https://aws.amazon.com/kinesis/data-streams/pricing/), AWS
- [Amazon Data Firehose pricing](https://aws.amazon.com/firehose/pricing/) and [buffering hints](https://docs.aws.amazon.com/firehose/latest/dev/create-configure-backup.html), AWS
- [Amazon Managed Service for Apache Flink pricing](https://aws.amazon.com/managed-service-apache-flink/pricing/), AWS
- [Amazon MSK pricing](https://aws.amazon.com/msk/pricing/), AWS
- [AWS Lambda with Kinesis](https://docs.aws.amazon.com/lambda/latest/dg/with-kinesis.html) and [Kinesis propagation delay](https://docs.aws.amazon.com/streams/latest/dev/kinesis-low-latency.html), AWS documentation
- [AWS Price List API](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-the-aws-price-list-bulk-api.html), offer files published September 11, 2026 (Lambda: October 12, 2026)
