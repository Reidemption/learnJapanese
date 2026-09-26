import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import QuizSession from "./QuizSession.vue";
import type { Question } from "../types";

function question(id: string, correct: string): Question {
  return {
    id: `${id}:meaning`,
    jlpt: "N5",
    kind: "meaning",
    promptJa: [{ ja: id }],
    choices: [
      { id: "a", en: `${id}-a` },
      { id: "b", en: `${id}-b` },
      { id: "c", en: `${id}-c` },
      { id: "d", en: `${id}-d` },
    ],
    correctId: correct,
  };
}

const questions = [question("one", "a"), question("two", "b"), question("three", "c")];

function press(key: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, ...init }));
}

beforeEach(() => {
  localStorage.clear();
});

describe("QuizSession", () => {
  it("shows the prompt, four choices and the progress label", () => {
    const wrapper = mount(QuizSession, { props: { questions, label: "Food · Meaning" } });
    expect(wrapper.findAll(".choice")).toHaveLength(4);
    expect(wrapper.find(".session-bar").text()).toContain("1 / 3");
    expect(wrapper.find(".session-bar").text()).toContain("Food · Meaning");
  });

  it("ignores number keys pressed with Ctrl, Alt or Meta", async () => {
    const wrapper = mount(QuizSession, { props: { questions, label: "x" } });
    press("1", { ctrlKey: true });
    press("2", { altKey: true });
    press("3", { metaKey: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".is-correct").exists()).toBe(false);
    press("1");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".is-correct").exists()).toBe(true);
  });

  it("marks the picked choice right or wrong and locks the rest", async () => {
    const wrapper = mount(QuizSession, { props: { questions, label: "x" } });
    const choices = wrapper.findAll(".choice");
    const wrong = choices.find((c) => c.text().includes("one-b"))!;
    await wrong.trigger("click");

    expect(wrapper.find(".is-wrong").text()).toContain("one-b");
    expect(wrapper.find(".is-correct").text()).toContain("one-a");
    expect(wrapper.findAll(".is-dim")).toHaveLength(2);
    expect(wrapper.find(".is-wrong .num").text()).toBe("✗");
    expect(wrapper.find(".is-correct .num").text()).toBe("✓");
    expect(choices.every((c) => c.attributes("disabled") !== undefined)).toBe(true);
  });

  it("numbers the choices until an answer is picked", () => {
    const wrapper = mount(QuizSession, { props: { questions, label: "x" } });
    expect(wrapper.findAll(".choice .num").map((n) => n.text())).toEqual(["1", "2", "3", "4"]);
    expect(wrapper.find(".is-dim").exists()).toBe(false);
  });

  it("scores a run driven by the keyboard and reports what was missed", async () => {
    const wrapper = mount(QuizSession, { props: { questions, label: "x" } });

    for (const answer of ["one-a", "two-a", "three-c"]) {
      const index = wrapper.findAll(".choice").findIndex((c) => c.text().includes(answer));
      press(String(index + 1));
      await wrapper.vm.$nextTick();
      press("Enter");
      await wrapper.vm.$nextTick();
    }

    const done = wrapper.emitted("done");
    expect(done).toHaveLength(1);
    const payload = done![0]![0] as {
      correct: number;
      total: number;
      missed: Question[];
      results: { itemId: string; mode: string; correct: boolean }[];
    };
    expect(payload).toMatchObject({ correct: 2, total: 3 });
    expect(payload.missed.map((q) => q.id)).toEqual(["two:meaning"]);
    expect(payload.results).toEqual([
      { itemId: "one", mode: "meaning", correct: true },
      { itemId: "two", mode: "meaning", correct: false },
      { itemId: "three", mode: "meaning", correct: true },
    ]);
  });

  it("ignores extra picks and keys outside 1–4", async () => {
    const wrapper = mount(QuizSession, { props: { questions, label: "x" } });
    press("9");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".is-correct").exists()).toBe(false);

    await wrapper.findAll(".choice")[0]!.trigger("click");
    await wrapper.findAll(".choice")[1]!.trigger("click");
    expect(wrapper.findAll(".is-wrong").length).toBeLessThanOrEqual(1);
  });

  it("does not finish early when Enter is pressed before answering", async () => {
    const wrapper = mount(QuizSession, { props: { questions, label: "x" } });
    press("Enter");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("done")).toBeUndefined();
    expect(wrapper.find(".session-bar").text()).toContain("1 / 3");
  });

  describe("as a test", () => {
    function testQuestion(id: string, kind: Question["kind"]): Question {
      return {
        id: `${id}:${kind}`,
        jlpt: "N5",
        kind,
        // Readings and glosses here would show without the test's override.
        promptJa: [{ ja: "水", reading: "みず", en: "water" }],
        choices: [
          { id: "a", en: `${id}-${kind}-a` },
          { id: "b", en: `${id}-${kind}-b` },
          { id: "c", en: `${id}-${kind}-c` },
          { id: "d", en: `${id}-${kind}-d` },
        ],
        correctId: "a",
      };
    }

    const testQuestions = [
      testQuestion("one", "meaning"),
      testQuestion("one", "reverse"),
      testQuestion("two", "meaning"),
      testQuestion("two", "reverse"),
      testQuestion("three", "meaning"),
    ];

    it("gives no feedback between questions and adds \"I don't know\"", async () => {
      const wrapper = mount(QuizSession, { props: { questions: testQuestions, label: "x", test: true } });
      expect(wrapper.findAll(".choice")).toHaveLength(5);
      expect(wrapper.find(".dont-know").text()).toContain("I don't know");
      expect(wrapper.find(".dont-know .num").text()).toBe("0");
      // No furigana, no hint, whatever the global settings say.
      expect(wrapper.find(".prompt .ruby-text").classes()).toContain("kana-off");
      expect(wrapper.find(".tip").exists()).toBe(false);

      press("2");
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".is-correct, .is-wrong, .is-dim").exists()).toBe(false);
      expect(wrapper.find(".next-row").exists()).toBe(false);
      expect(wrapper.find(".session-bar").text()).toContain("2 / 5");
    });

    it("scores per unit from keys, with 0 for \"I don't know\"", async () => {
      const wrapper = mount(QuizSession, { props: { questions: testQuestions, label: "x", test: true } });
      // one: both right. two: one wrong. three: "I don't know".
      const plan: Record<string, string> = {
        "one:meaning": "a",
        "one:reverse": "a",
        "two:meaning": "a",
        "two:reverse": "c",
      };
      for (let i = 0; i < testQuestions.length; i++) {
        const [, count] = wrapper.find(".session-bar").text().match(/(\d+) \/ 5/)!;
        const question = testQuestions[Number(count) - 1]!;
        const want = plan[question.id];
        if (!want) {
          press("0");
        } else {
          const index = wrapper
            .findAll(".choice")
            .findIndex((c) => c.text().includes(`${question.id.replace(":", "-")}-${want}`));
          press(String(index + 1));
        }
        await wrapper.vm.$nextTick();
      }

      const payload = wrapper.emitted("done")![0]![0] as {
        correct: number;
        total: number;
        results: { itemId: string; mode: string; correct: boolean; skipped?: boolean }[];
        units: { unitId: string; passed: boolean }[];
      };
      expect(payload).toMatchObject({ correct: 1, total: 3 });
      expect(payload.units.map((u) => [u.unitId, u.passed])).toEqual([
        ["one", true],
        ["two", false],
        ["three", false],
      ]);
      expect(payload.results).toHaveLength(5);
      expect(payload.results.at(-1)).toEqual({
        itemId: "three",
        mode: "meaning",
        correct: false,
        skipped: true,
      });
    });

    it("ignores 0 outside a test", async () => {
      const wrapper = mount(QuizSession, { props: { questions, label: "x" } });
      press("0");
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".is-correct").exists()).toBe(false);
      expect(wrapper.find(".dont-know").exists()).toBe(false);
    });
  });
});
