export interface Track {
  title: string;
  url: string;
  duration: string;
  requestedBy: string;
  thumbnail?: string;
}

export class MusicQueue {
  private tracks: Track[] = [];
  public loop = false;
  public currentTrack: Track | null = null;

  enqueue(track: Track) {
    this.tracks.push(track);
  }

  dequeue(): Track | null {
    if (this.tracks.length === 0) return null;
    return this.tracks.shift()!;
  }

  peek(): Track | null {
    return this.tracks[0] ?? null;
  }

  remove(index: number): Track | null {
    if (index < 0 || index >= this.tracks.length) return null;
    return this.tracks.splice(index, 1)[0]!;
  }

  clear() {
    this.tracks = [];
  }

  isEmpty(): boolean {
    return this.tracks.length === 0;
  }

  size(): number {
    return this.tracks.length;
  }

  getAll(): Track[] {
    return [...this.tracks];
  }

  shuffle() {
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j]!, this.tracks[i]!];
    }
  }
}
