<script setup lang="ts">
import { computed } from "vue";

/**
 * A small line over evenly spaced points. A null value is a gap: the line
 * breaks there rather than pretending to know the value.
 */
const props = withDefaults(
  defineProps<{
    values: (number | null)[];
    /** A second line on the same axes, drawn in its own colour (class `second`). */
    second?: (number | null)[];
    label: string;
    /** Top of the y axis; defaults to the largest value. */
    max?: number;
    /** Axis text for the first and last point. */
    startLabel?: string;
    endLabel?: string;
    format?: (value: number) => string;
  }>(),
  { format: (value: number) => String(value) },
);

const W = 320;
const H = 110;
const PAD = { top: 8, right: 6, bottom: 18, left: 30 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

const top = computed(() => {
  const numbers = [...props.values, ...(props.second ?? [])].filter((v): v is number => v !== null);
  return props.max ?? Math.max(1, ...numbers);
});

function x(index: number): number {
  const n = props.values.length;
  return PAD.left + (n <= 1 ? plotW / 2 : (index / (n - 1)) * plotW);
}

function y(value: number): number {
  return PAD.top + plotH - (value / top.value) * plotH;
}

type Run = { points: string; dots: { x: number; y: number }[] };

/** One polyline per run of non-null values. */
function runsOf(values: (number | null)[]): Run[] {
  const out: Run[] = [];
  let current: { x: number; y: number }[] = [];
  const close = () => {
    if (current.length) out.push({ points: current.map((p) => `${p.x},${p.y}`).join(" "), dots: current });
    current = [];
  };
  values.forEach((value, index) => {
    if (value === null) close();
    else current.push({ x: x(index), y: y(value) });
  });
  close();
  return out;
}

const runs = computed(() => runsOf(props.values));
const secondRuns = computed(() => (props.second ? runsOf(props.second) : []));
</script>

<template>
  <svg class="chart line-chart" role="img" :aria-label="label" :viewBox="`0 0 ${W} ${H}`">
    <title>{{ label }}</title>
    <line class="axis" :x1="PAD.left" :x2="W - PAD.right" :y1="PAD.top + plotH" :y2="PAD.top + plotH" />
    <line class="grid" :x1="PAD.left" :x2="W - PAD.right" :y1="PAD.top" :y2="PAD.top" />
    <text class="tick" :x="PAD.left - 5" :y="PAD.top + 4" text-anchor="end">{{ format(top) }}</text>
    <text class="tick" :x="PAD.left - 5" :y="PAD.top + plotH + 4" text-anchor="end">{{ format(0) }}</text>
    <text v-if="startLabel" class="tick" :x="PAD.left" :y="H - 4">{{ startLabel }}</text>
    <text v-if="endLabel" class="tick" :x="W - PAD.right" :y="H - 4" text-anchor="end">{{ endLabel }}</text>
    <template v-for="(run, i) in secondRuns" :key="`second-${i}`">
      <polyline v-if="run.dots.length > 1" class="line second" :points="run.points" />
      <circle v-else class="dot second" :cx="run.dots[0]!.x" :cy="run.dots[0]!.y" r="2.5" />
    </template>
    <template v-for="(run, i) in runs" :key="i">
      <polyline v-if="run.dots.length > 1" class="line" :points="run.points" />
      <circle v-else class="dot" :cx="run.dots[0]!.x" :cy="run.dots[0]!.y" r="2.5" />
    </template>
  </svg>
</template>
