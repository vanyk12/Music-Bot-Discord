import { GuildPlayer } from "./player.js";

const players = new Map<string, GuildPlayer>();

export function getOrCreatePlayer(guildId: string): GuildPlayer {
  if (!players.has(guildId)) {
    players.set(guildId, new GuildPlayer(guildId));
  }
  return players.get(guildId)!;
}

export function getPlayer(guildId: string): GuildPlayer | undefined {
  return players.get(guildId);
}

export function removePlayer(guildId: string): void {
  players.delete(guildId);
}
