<p align="center">
  <img src="figures/cover-social-1200x630.png" alt="The Price of Now: a split-flap departure board listing one event stream priced four ways on AWS, from Firehose at 717 dollars a month to Kinesis provisioned at 139." width="100%">
</p>

<h1 align="center">The price of now</h1>

<p align="center">
  What one event stream costs on AWS, priced eight ways, from "a few minutes late" to "under a second."<br>
  Companion code for the article <a href="article/the-price-of-now.md"><b>The Price of Now</b></a>.
</p>

<p align="center">
  <a href="https://github.com/sirik11/price-of-now/actions/workflows/test.yml"><img src="https://github.com/sirik11/price-of-now/actions/workflows/test.yml/badge.svg" alt="test"></a>
  <img src="https://img.shields.io/badge/python-3.8%2B-111316" alt="Python 3.8+">
  <img src="https://img.shields.io/badge/dependencies-0-FFB52E" alt="Zero dependencies">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-6B7079" alt="MIT license"></a>
</p>

---

For 2,000 events per second of 500 bytes, Data Firehose (data a few minutes old) costs **$717 a month**, and a Kinesis data stream with a Lambda consumer (about a second) costs **$139**. Firehose bills ingestion "in 5KB increments," so each 500-byte event is billed as 5 KB. Pack ten events per record and Firehose drops to $72.

The bill is driven by record sizes, capacity modes, and minimum charges, not by freshness. This calculator shows where your money goes.

## Quick start

One file, standard library only, prices included.

```bash
git clone https://github.com/sirik11/price-of-now && cd price-of-now
python3 realtime_cost.py --events 2000 --bytes 500
python3 realtime_cost.py --events 2000 --bytes 500 --batch 10 --detail
```

<p align="center">
  <img src="figures/receipt.png" alt="Calculator output printed as a ticket receipt: monthly fares for eight ways to run 2,000 events per second of 500 bytes, lowest fare Kinesis provisioned at 139.10 dollars." width="100%">
</p>

| Flag | Meaning | Default |
| --- | --- | --- |
| `--events` | events per second | 2000 |
| `--bytes` | average event size | 500 |
| `--consumers` | applications reading the stream | 1 |
| `--batch` | events your producer packs into one record | 1 |
| `--detail` | show every line item | off |
| `--json` | machine-readable output | off |

## What it prices

| Freshness | Route | What's in the fare |
| --- | --- | --- |
| minutes | Data Firehose to S3 | ingestion, billed per record in 5 KB increments |
| ~1 second | Kinesis Data Streams, provisioned, + Lambda | shard-hours, 25 KB PUT payload units, Lambda (ARM, 512 MB, 100 ms per batch of 100) |
| ~1 second | Kinesis Data Streams, On-demand Standard, + Lambda | per GB in and out (records rounded up to 1 KB), stream-hours, Lambda |
| ~1 second | Kinesis Data Streams, On-demand Advantage, + Lambda | per GB in and out, with the 25 MB/s account-wide minimum |
| seconds, stateful | Kinesis provisioned + Managed Service for Apache Flink | 1 KPU + 1 orchestration KPU, 50 GB running storage |
| sub-second | Amazon MSK, 3 x kafka.m7g.large | broker-hours, EBS storage at replication factor 3 |
| sub-second | Amazon MSK Express, 3 x express.m7g.large | broker-hours, per GB in, storage |
| sub-second | Amazon MSK Serverless | cluster-hours, partition-hours, per GB in and out, storage |

Each option is priced at the smallest size that carries the load. **Not included:** data transfer between Availability Zones or to the internet, the query or storage layer after the stream, free tiers, and headroom for spikes.

## Why you can trust the numbers

- **Prices** come from the [AWS Price List API](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-the-aws-price-list-bulk-api.html) and are stored in [`prices.json`](prices.json) with each offer file's publication date. Refresh them any time with `python3 update_prices.py`.
- **Billing rules** (rounding, minimums, orchestration KPUs) are taken from each service's pricing page.
- **Tests** in [`test_realtime_cost.py`](test_realtime_cost.py) reproduce AWS's own worked examples from the Kinesis Data Streams and Firehose pricing pages to within 0.1%, and CI runs them on every push.

## The research in one chart

<p align="center">
  <img src="figures/fig1-departure-board.png" alt="Departure board of eight routes for the same stream with their monthly fares, from 139 dollars for Kinesis provisioned to 3,082 dollars for Kinesis on-demand Advantage." width="100%">
</p>

## Figures

| | |
| :---: | :---: |
| <img src="figures/fig2-billed-vs-sent.png" alt="A 500-byte event billed as 1 KB by Kinesis on-demand and 5 KB by Firehose, unless batched" width="100%"><br>**You pay for the box, not the parcel** | <img src="figures/fig3-minimum-fares.png" alt="Monthly minimum charges before any traffic, from zero for Firehose to 3,037.50 dollars for Kinesis on-demand Advantage" width="100%"><br>**The minimum fare** |
| <img src="figures/fig4-route-map.png" alt="Route map from who acts on the data to the cheapest option for each case" width="100%"><br>**Which line do you need?** | <img src="figures/cover-the-price-of-now.png" alt="Cover" width="100%"><br>**Cover** |

Every figure is drawn by [`figures/make_figures.mjs`](figures/make_figures.mjs) from the calculator's `--json` output, so the figures can't disagree with the numbers. Set in Oswald, Inter, and Space Mono (all OFL, in `figures/fonts/`), rendered by headless Chrome. No npm dependencies.

```bash
node figures/make_figures.mjs
```

## License

[MIT](LICENSE) © 2026 Sai Shirish Katady
