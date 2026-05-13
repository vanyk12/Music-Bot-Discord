import { REST, Routes } from "discord.js";
import { logger } from "../lib/logger.js";
import * as play from "./commands/play.js";
import * as pause from "./commands/pause.js";
import * as resume from "./commands/resume.js";
import * as skip from "./commands/skip.js";
import * as stop from "./commands/stop.js";
import * as volume from "./commands/volume.js";
import * as queue from "./commands/queue.js";
import * as loop from "./commands/loop.js";
import * as shuffle from "./commands/shuffle.js";
import * as nowplaying from "./commands/nowplaying.js";
import * as remove from "./commands/remove.js";

const commands = [
  play.data,
  pause.data,
  resume.data,
  skip.data,
  stop.data,
  volume.data,
  queue.data,
  loop.data,
  shuffle.data,
  nowplaying.data,
  remove.data,
].map((c) => c.toJSON());

export async function deployCommands(token: string, clientId: string) {
  const rest = new REST({ version: "10" }).setToken(token);

  try {
    logger.info("Регистрация slash-команд...");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    logger.info(`Зарегистрировано ${commands.length} команд глобально.`);
  } catch (err) {
    logger.error({ err }, "Ошибка при регистрации команд");
    throw err;
  }
}
