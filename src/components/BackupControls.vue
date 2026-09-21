<script setup lang="ts">
import { computed, ref } from "vue";
import { exportProgress, importProgress } from "../api";
import { read, write } from "../progress";
import { backupFileName, parseBackup } from "../study/backup";

const emit = defineEmits<{ restored: [] }>();

const message = ref("");
const busy = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

// Kept on this device only: it's a nudge to download another, not a record.
const LAST_BACKUP_KEY = "lj.lastBackupAt";
const lastBackupAt = ref(read<number | null>(LAST_BACKUP_KEY, null));
const lastBackupLabel = computed(() => {
  const at = lastBackupAt.value;
  if (typeof at !== "number") return "No backup downloaded on this device yet.";
  const date = new Date(at).toLocaleDateString(undefined, { dateStyle: "medium" });
  return `Last downloaded ${date}.`;
});

async function download(): Promise<void> {
  busy.value = true;
  try {
    const backup = await exportProgress();
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = backupFileName(backup.exportedAt || Date.now());
    link.click();
    URL.revokeObjectURL(url);
    lastBackupAt.value = Date.now();
    write(LAST_BACKUP_KEY, lastBackupAt.value);
    const sessions = backup.attempts.length;
    message.value = `Saved ${sessions} session${sessions === 1 ? "" : "s"}.`;
  } catch (error) {
    message.value = `Backup failed: ${(error as Error).message}`;
  } finally {
    busy.value = false;
  }
}

async function restore(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  busy.value = true;
  try {
    const result = await importProgress(parseBackup(await file.text()));
    const parts = [`Restored ${result.imported} session${result.imported === 1 ? "" : "s"}`];
    if (result.duplicates) parts.push(`${result.duplicates} already here`);
    if (result.skipped) parts.push(`${result.skipped} for decks that no longer exist`);
    message.value = `${parts.join(", ")}.`;
    emit("restored");
  } catch (error) {
    message.value = `Restore failed: ${(error as Error).message}`;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="backup">
    <h3 class="group-heading">Backup</h3>
    <p class="backup-note">
      Progress is saved as you study. A backup file keeps it safe if browser data is cleared.
      <span class="last-backup">{{ lastBackupLabel }}</span>
    </p>
    <div class="actions">
      <button class="ghost" type="button" :disabled="busy" @click="download">
        Download backup
      </button>
      <button class="ghost" type="button" :disabled="busy" @click="fileInput?.click()">
        Restore backup
      </button>
      <input
        ref="fileInput"
        class="visually-hidden"
        type="file"
        accept="application/json,.json"
        aria-label="Backup file"
        @change="restore"
      />
    </div>
    <p v-if="message" class="backup-note" role="status">{{ message }}</p>
  </section>
</template>
