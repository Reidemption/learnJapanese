import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BackupControls from "./BackupControls.vue";
import { staticApi } from "../api";
import { getItemStats } from "../progress";

const backup = {
  version: 1,
  exportedAt: 1,
  baseline: {},
  attempts: [
    {
      uid: "u1",
      deckId: "n5-food",
      mode: "meaning",
      correct: 1,
      total: 1,
      kana: false,
      hints: false,
      at: 1_700_000_000_000,
      items: [{ itemId: "n5-food-1", mode: "meaning", correct: true }],
    },
  ],
};

async function choose(wrapper: ReturnType<typeof mount>, text: string) {
  const input = wrapper.find("input[type=file]");
  const file = new File([text], "backup.json", { type: "application/json" });
  Object.defineProperty(input.element, "files", { value: [file], configurable: true });
  await input.trigger("change");
  await flushPromises();
  // File.text() resolves outside Vue's queue in jsdom.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BackupControls", () => {
  it("restores a backup file and says what it did", async () => {
    const wrapper = mount(BackupControls);
    await choose(wrapper, JSON.stringify(backup));
    expect(wrapper.text()).toContain("Restored 1 session");
    expect(wrapper.emitted("restored")).toHaveLength(1);
    expect(getItemStats()["n5-food-1"]).toMatchObject({ seen: 1, correct: 1 });

    await choose(wrapper, JSON.stringify(backup));
    expect(wrapper.text()).toContain("Restored 0 sessions, 1 already here");
  });

  it("explains a bad file instead of restoring it", async () => {
    const wrapper = mount(BackupControls);
    await choose(wrapper, "{nope");
    expect(wrapper.text()).toContain("Restore failed: That file is not valid JSON.");
    expect(wrapper.emitted("restored")).toBeUndefined();
  });

  it("downloads the current progress as a dated JSON file", async () => {
    await staticApi.postAttempt({ ...backup.attempts[0]!, mode: "meaning" } as never);
    const created: Blob[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: (blob: Blob) => {
        created.push(blob);
        return "blob:x";
      },
      revokeObjectURL: () => {},
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const wrapper = mount(BackupControls);
    await wrapper.findAll("button")[0]!.trigger("click");
    await flushPromises();

    expect(click).toHaveBeenCalledOnce();
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toMatch(/^learnjapanese-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const saved = JSON.parse(await created[0]!.text());
    expect(saved.attempts).toHaveLength(1);
    expect(wrapper.text()).toContain("Saved 1 session.");
    vi.unstubAllGlobals();
  });
});
