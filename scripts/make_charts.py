#!/usr/bin/env python3
"""Generate the README charts from the measured results.

Run from the project root:  python scripts/make_charts.py
Output: docs/charts/*.png
"""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

OUT = Path("docs/charts")
OUT.mkdir(parents=True, exist_ok=True)

COLORS = {
    "hash": "#4C78A8",
    "consistent": "#F58518",
    "range": "#54A24B",
    "directory": "#B279A2",
}
GREY = "#6B7280"
RED = "#E45756"

plt.rcParams.update(
    {
        "axes.spines.top": False,
        "axes.spines.right": False,
        "font.size": 10,
        "axes.titlesize": 12,
        "axes.titleweight": "bold",
    }
)


def save(fig, name):
    fig.tight_layout()
    fig.savefig(OUT / name, dpi=200)
    plt.close(fig)
    print("saved", OUT / name)


def label_bars(ax, bars, fmt="{:.0f}", pad=3, size=9):
    for b in bars:
        ax.annotate(
            fmt.format(b.get_height()),
            (b.get_x() + b.get_width() / 2, b.get_height()),
            ha="center",
            va="bottom",
            xytext=(0, pad),
            textcoords="offset points",
            fontsize=size,
        )


# 7.1: keys moved when the shard count changes
def chart_keys_moved():
    labels = ["Add a shard (4 to 5)", "Remove a shard (4 to 3)"]
    hash_v = [79.98, 74.93]
    cons_v = [19.62, 26.05]
    ideal = [20.0, 25.0]
    x = np.arange(len(labels))
    w = 0.35

    fig, ax = plt.subplots(figsize=(6.5, 4))
    b1 = ax.bar(x - w / 2, hash_v, w, label="hash (% N)", color=COLORS["hash"])
    b2 = ax.bar(x + w / 2, cons_v, w, label="consistent (150 vnodes)", color=COLORS["consistent"])
    label_bars(ax, b1, "{:.1f}%")
    label_bars(ax, b2, "{:.1f}%")
    for xi, i in zip(x, ideal):
        ax.hlines(i, xi - w, xi + w, colors=GREY, linestyles="--", linewidth=1)
    ax.plot([], [], "--", color=GREY, label="ideal minimum")
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylabel("keys that change shard (%)")
    ax.set_ylim(0, 100)
    ax.set_title("Cost of changing the shard count (1M keys)")
    ax.legend(frameon=False)
    save(fig, "keys-moved.png")


# 7.2: virtual nodes vs balance
def chart_vnodes():
    vn = ["1", "10", "50", "150", "500", "1000"]
    cv = [55.48, 30.26, 8.52, 3.64, 3.17, 1.74]
    ratio = [5.385, 2.270, 1.257, 1.089, 1.081, 1.045]

    fig, axes = plt.subplots(1, 2, figsize=(10, 4))

    b = axes[0].bar(vn, cv, color=COLORS["consistent"])
    label_bars(axes[0], b, "{:.1f}")
    axes[0].axhline(0.17, color=COLORS["hash"], linestyle="--", linewidth=1.2, label="hash (0.17%)")
    axes[0].set(
        xlabel="virtual nodes per shard",
        ylabel="std dev of shard size (% of mean)",
        title="Imbalance vs virtual nodes",
    )
    axes[0].legend(frameon=False)

    b = axes[1].bar(vn, ratio, color=COLORS["consistent"])
    label_bars(axes[1], b, "{:.2f}")
    axes[1].axhline(1.005, color=COLORS["hash"], linestyle="--", linewidth=1.2, label="hash (1.005)")
    axes[1].set(
        xlabel="virtual nodes per shard",
        ylabel="busiest / quietest shard",
        title="Largest vs smallest shard",
    )
    axes[1].legend(frameon=False)
    save(fig, "vnodes-balance.png")


# Step 6: key lookups, 1 DB vs 2 vs 4 shards
def chart_step6():
    setups = ["1 DB", "2 shards", "4 shards"]
    rps = [752, 818, 856]
    read_p95 = [209, 206, 183]
    write_p95 = [380, 422, 330]

    fig, axes = plt.subplots(1, 2, figsize=(10, 4))

    b = axes[0].bar(setups, rps, color=[GREY, "#8DA0CB", COLORS["hash"]])
    label_bars(axes[0], b)
    axes[0].set(ylabel="requests per second", title="Throughput (90% reads / 10% writes)")
    axes[0].set_ylim(0, max(rps) * 1.2)

    x = np.arange(len(setups))
    w = 0.35
    b1 = axes[1].bar(x - w / 2, read_p95, w, label="read p95", color=COLORS["hash"])
    b2 = axes[1].bar(x + w / 2, write_p95, w, label="write p95", color=COLORS["consistent"])
    label_bars(axes[1], b1)
    label_bars(axes[1], b2)
    axes[1].set_xticks(x)
    axes[1].set_xticklabels(setups)
    axes[1].set(ylabel="latency (ms)", title="p95 latency")
    axes[1].legend(frameon=False)
    save(fig, "step6-lookups.png")


# Key lookup vs query without the shard key, relative to 1 DB
def chart_contrast():
    lookups = np.array([752, 818, 856], dtype=float)
    scatter = np.array([712, 493, 281], dtype=float)
    rel_l = lookups / lookups[0]
    rel_s = scatter / scatter[0]
    x = np.arange(3)
    w = 0.35

    fig, ax = plt.subplots(figsize=(7, 4))
    b1 = ax.bar(x - w / 2, rel_l, w, label="Lookup by shard key", color=COLORS["hash"])
    b2 = ax.bar(x + w / 2, rel_s, w, label="Query without shard key (scatter-gather)", color=RED)
    label_bars(ax, b1, "{:.2f}x")
    label_bars(ax, b2, "{:.2f}x")
    ax.axhline(1, color=GREY, linestyle="--", linewidth=1)
    ax.set_xticks(x)
    ax.set_xticklabels(["1 DB", "2 shards", "4 shards"])
    ax.set_ylabel("throughput relative to 1 DB")
    ax.set_ylim(0, 1.4)
    ax.set_title("Sharding helps some queries and hurts others")
    ax.legend(frameon=False, loc="upper right")
    save(fig, "lookup-vs-scatter.png")


# 7.3 and 7.4: busiest shard's share of load by scenario and strategy
def chart_scenarios():
    scen = ["Seeded data", "New writes", "Uniform reads", "Zipf reads", "Hot key\n(30% on id 1)"]
    data = {
        "hash": [25.1, 25.1, 25.1, 29.6, 47.5],
        "consistent": [26.0, 26.0, 26.0, 28.6, 48.1],
        "range": [25.0, 100.0, 25.1, 90.0, 47.5],
        "directory": [25.0, 25.1, 25.0, 60.7, 47.5],
    }
    x = np.arange(len(scen))
    w = 0.2

    fig, ax = plt.subplots(figsize=(10, 4.5))
    for i, (name, vals) in enumerate(data.items()):
        bars = ax.bar(x + (i - 1.5) * w, vals, w, label=name, color=COLORS[name])
        label_bars(ax, bars, "{:.0f}", pad=2, size=8)
    ax.axhline(25, color=GREY, linestyle="--", linewidth=1)
    ax.text(len(scen) - 0.55, 27, "ideal 25%", color=GREY, ha="right", fontsize=8)
    ax.set_xticks(x)
    ax.set_xticklabels(scen)
    ax.set_ylabel("busiest shard's share of load (%)")
    ax.set_ylim(0, 112)
    ax.set_title("How uneven does each strategy get? (4 shards, simulation)")
    ax.legend(frameon=False, ncol=4, loc="upper left")
    save(fig, "strategy-scenarios.png")


# 7.5b: id-range query by strategy
def chart_range_query():
    names = ["hash", "consistent", "range", "directory"]
    rps = [293, 305, 735, 449]
    fan = [4, 4, 1, 2]

    fig, ax = plt.subplots(figsize=(7, 4))
    bars = ax.bar(names, rps, color=[COLORS[n] for n in names])
    for b, f in zip(bars, fan):
        ax.annotate(
            f"{b.get_height():.0f} req/s\n{f} shard{'s' if f > 1 else ''} per query",
            (b.get_x() + b.get_width() / 2, b.get_height()),
            ha="center",
            va="bottom",
            xytext=(0, 3),
            textcoords="offset points",
            fontsize=9,
        )
    ax.set_ylim(0, max(rps) * 1.25)
    ax.set_ylabel("requests per second")
    ax.set_title("Id-range query: fewer shards touched, more throughput")
    save(fig, "range-query.png")


if __name__ == "__main__":
    chart_keys_moved()
    chart_vnodes()
    chart_step6()
    chart_contrast()
    chart_scenarios()
    chart_range_query()