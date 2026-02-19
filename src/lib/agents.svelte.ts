// src/lib/agents.svelte.ts
import { type CustomAgent } from "./types";

function createAgentsStore() {
  let list = $state<CustomAgent[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        list = await res.json();
      } else {
        error = "Failed to load agents";
      }
    } catch {
      error = "Network error loading agents";
    } finally {
      loading = false;
    }
  }

  async function importAgent(file: File) {
    try {
      const text = await file.text();
      const content = JSON.parse(text);
      
      const res = await fetch("/api/agents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content)
      });
      
      if (res.ok) {
        await load();
        return { success: true };
      }
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      return { success: false, error: err.error || "Import failed" };
    } catch {
      return { success: false, error: "Invalid file" };
    }
  }

  async function deleteAgent(id: string) {
    try {
      const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
      if (res.ok) {
        await load();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
  
  async function exportAgent(id: string) {
      // Trigger download
      window.open(`/api/agents/${id}/export`, '_blank');
  }

  return {
    get list() { return list; },
    get loading() { return loading; },
    get error() { return error; },
    load,
    import: importAgent,
    delete: deleteAgent,
    export: exportAgent
  };
}

export const agents = createAgentsStore();
