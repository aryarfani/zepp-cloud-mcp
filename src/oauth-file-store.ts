import fs from "node:fs";
import path from "node:path";
import { emptyState, type OAuthState, type OAuthStore } from "./oauth";

/** JSON file store (0600, atomic writes). Re-reads when the file changes on disk. */
export class FileOAuthStore implements OAuthStore {
  private cache: OAuthState | null = null;
  private sig = "";
  constructor(private file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  }
  read(): OAuthState {
    let st: fs.Stats;
    try { st = fs.statSync(this.file); } catch { this.cache = null; this.sig = ""; return emptyState(); }
    const sig = `${st.mtimeMs}:${st.size}`;
    if (!this.cache || sig !== this.sig) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
        this.cache = { ...emptyState(), ...parsed };
      } catch {
        this.cache = emptyState();
      }
      this.sig = sig;
    }
    return structuredClone(this.cache!);
  }
  write(state: OAuthState): void {
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, this.file);
    const st = fs.statSync(this.file);
    this.cache = structuredClone(state);
    this.sig = `${st.mtimeMs}:${st.size}`;
  }
}