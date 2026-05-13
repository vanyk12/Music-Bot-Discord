import {
  Client,
  GatewayIntentBits,
  Interaction,
  ChatInputCommandInteraction,
} from "discord.js";
import { logger } from "../lib/logger.js";
import { deployCommands } from "./deploy-commands.js";
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

type Command = {
  data: { name: string };
  execute: (i: ChatInputCommandInteraction) => Promise<unknown>;
};

const commandMap = new Map<string, Command>();
for (const cmd of [play, pause, resume, skip, stop, volume, queue, loop, shuffle, nowplaying, remove]) {
  commandMap.set(cmd.data.name, cmd as Command);
}

export async function startBot() {
  if (process.env["DISABLE_BOT"] === "true") {
    logger.info("DISABLE_BOT=true — бот не запущен на этом окружении.");
    return;
  }

  const token = process.env["DISCORD_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_TOKEN не задан — бот не запущен.");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
    ],
  });

  client.once("ready", async (c) => {
    logger.info(`Бот запущен как ${c.user.tag}`);
    try {
      await deployCommands(token, c.user.id);
    } catch (err) {
      logger.error({ err }, "Не удалось зарегистрировать команды");
    }
  });

  client.on("interactionCreate", async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commandMap.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error({ err, cmd: interaction.commandName }, "Ошибка выполнения команды");
      const msg = "❌ Произошла ошибка при выполнении команды.";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg, ephemeral: true });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    }
  });

  process.on("unhandledRejection", (err) => {
    logger.error({ err }, "Unhandled promise rejection");
  });

  process.on("uncaughtException", (err) => {
    logger.error({ err }, "Uncaught exception");
  });

  await client.login(token);
}
