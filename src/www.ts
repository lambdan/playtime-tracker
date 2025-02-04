import { join } from "path";
import { Postgres } from "./postgres";

import { readFile } from "fs/promises";
import { Discord } from "./discord";
import { formatSeconds, timeSince } from "./utils";
import { stat } from "fs";

const APP_VERSION = require("../package.json").version;

export class www {
  private postgres: Postgres;
  private discord: Discord;

  constructor(postgres: Postgres, discord: Discord) {
    this.postgres = postgres;
    this.discord = discord;
  }

  async constructHTML(content: string): Promise<string> {
    const header = await readFile(
      join(__dirname, "../static/_header.html"),
      "utf-8"
    );
    let footer = await readFile(
      join(__dirname, "../static/_footer.html"),
      "utf-8"
    );
    footer = footer.replace("<%VERSION%>", APP_VERSION);
    return header + content + footer;
  }

  async frontPage(): Promise<string> {
    return this.constructHTML(
      await readFile(join(__dirname, "../static/frontpage.html"), "utf-8")
    );
  }

  async usersPage(): Promise<string> {
    const userIDs = await this.postgres.fetchUserIDs();
    let TR = `<tr ><th></th><th>Username</th><th>Time Played</th><th>Last Active</th></tr>`;
    for (const u of userIDs) {
      const user = await this.postgres.fetchUser(u);
      if (!user) {
        continue;
      }
      const discordInfo = await this.discord.getUser(u);

      TR += `<tr >`;
      TR += `<td class="col-lg-1"><a href="/user/${u}" ><img src="${
        discordInfo!.avatarURL
      }" class="img-thumbnail img-fluid rounded-circle"></a></td>`;
      TR += `<td class="col align-middle"><a href="/user/${u}">${
        discordInfo!.username
      }</td></a>`;
      TR += `<td sorttable_customkey="${user.totalPlaytime}" title="${
        user.totalPlaytime
      } seconds" class="col align-middle">${formatSeconds(
        user.totalPlaytime
      )}</td>`;
      TR += `<td sorttable_customkey="${user.lastActive.getTime()}" title="${user.lastActive.toUTCString()}" class="col align-middle">${timeSince(
        user.lastActive
      )}</td>`;
      TR += `</tr>\n`;
    }
    let html = await readFile(join(__dirname, "../static/users.html"), "utf-8");
    html = html.replace("<%TABLE_ROWS%>", TR);
    return this.constructHTML(html);
  }

  async gamesPage(): Promise<string> {
    const games = await this.postgres.fetchGames();
    let totalTime = 0;
    let totalSessions = 0;
    let TR = "";
    for (const game of games) {
      TR += `<tr>`;
      TR += `<td><a href="/game/${game.id}">` + game.name + "</a></td>";
      TR += "<td>" + game.players.length + "</td>";
      TR += "<td>" + game.sessions.length + "</td>";
      TR +=
        `<td sorttable_customkey="${game.totalPlaytime}" title="${game.totalPlaytime} seconds">` +
        formatSeconds(game.totalPlaytime) +
        "</td>";
      TR += `</tr>\n`;
      totalTime += game.totalPlaytime;
      totalSessions += game.sessions.length;
    }
    let html = await readFile(join(__dirname, "../static/games.html"), "utf-8");
    html = html.replaceAll("<%TABLE_ROWS%>", TR);
    html = html.replaceAll("<%TOTAL_PLAYTIME%>", formatSeconds(totalTime));
    html = html.replaceAll("<%TOTAL_SESSIONS%>", totalSessions + "");
    html = html.replaceAll("<%GAME_COUNT%>", games.length + "");
    return this.constructHTML(html);
  }

  async gamePage(gameID: number): Promise<string> {
    const game = await this.postgres.fetchGame(gameID);

    if (!game) {
      return await this.errorPage("Unknown game");
    }

    let TR = "";

    for (const userId of game.players) {
      const stats = game.getGameStatsForUser(userId);
      const discordInfo = await this.discord.getUser(userId);

      TR += `<tr class="align-middle">`;
      TR += `<td class="col-lg-1"><a href="/user/${userId}" ><img src="${
        discordInfo!.avatarURL
      }" class="img-thumbnail img-fluid rounded-circle"></a></td>`;
      TR += `<td class="col"><a href="/user/${userId}">${
        discordInfo!.username
      }</td></a>`;
      TR += `<td sorttable_customkey="${stats.seconds}" title="${
        stats.seconds
      } seconds" class="col align-middle">${formatSeconds(stats.seconds)}</td>`;
      TR += `<td>${stats.sessions.length}</td>`;
      TR += `<td sorttable_customkey="${
        stats.longestSession.seconds
      }" title="${stats.longestSession.date.toUTCString()}">${formatSeconds(
        stats.longestSession.seconds
      )}</td>`;
      TR += `<td sorttable_customkey="${stats.lastPlayed.getTime()}" title="${stats.lastPlayed.toUTCString()}" class="col align-middle">${timeSince(
        stats.lastPlayed
      )}</td>`;
      TR += `</tr>\n`;
    }

    let html = await readFile(join(__dirname, "../static/game.html"), "utf-8");
    html = html.replaceAll("<%TABLE_ROWS%>", TR);
    html = html.replaceAll("<%GAME_NAME%>", game.name);
    html = html.replaceAll("<%PLAYER_COUNT%>", game.players.length + "");
    html = html.replaceAll("<%SESSIONS%>", game.sessions.length + "");
    html = html.replaceAll(
      "<%TOTAL_PLAYTIME%>",
      formatSeconds(game.totalPlaytime)
    );
    return await this.constructHTML(html);
  }

  async userPage(userID: string): Promise<string> {
    const user = await this.postgres.fetchUser(userID);
    if (!user) {
      return await this.errorPage("Unknown user.");
    }
    const discordInfo = await this.discord.getUser(userID);

    let TR = "";
    for (const game of user.games) {
      const stats = game.getGameStatsForUser(userID);
      TR += "<tr>";
      TR += `<td><a href="/game/${game.id}">` + game.name + "</a></td>";
      TR +=
        `<td sorttable_customkey="${stats.seconds}" title="${stats.seconds} seconds">` +
        formatSeconds(stats.seconds) +
        "</td>";
      TR += "<td>" + stats.sessions.length + "</td>";
      TR += `<td sorttable_customkey="${
        stats.longestSession.seconds
      }" title="${stats.longestSession.date.toUTCString()}">${formatSeconds(
        stats.longestSession.seconds
      )}</td>`;
      TR +=
        `<td sorttable_customkey="${stats.lastPlayed.getTime()}" title="${stats.lastPlayed.toUTCString()}">` +
        timeSince(stats.lastPlayed) +
        "</td>";
      TR += "</tr>\n";
    }
    let html = await readFile(join(__dirname, "../static/user.html"), "utf-8");
    html = html.replaceAll("<%USERNAME%>", discordInfo!.username);
    //html = html.replace("<%BORDER_COLOR%>", discordInfo!.bannerColor);
    html = html.replaceAll("<%AVATAR_URL%>", discordInfo!.avatarURL);
    html = html.replaceAll("<%TABLE_ROWS%>", TR);
    html = html.replaceAll(
      "<%TOTAL_PLAYTIME%>",
      formatSeconds(user.totalPlaytime) + ""
    );
    html = html.replaceAll("<%SESSIONS%>", user.sessions.length + "");
    html = html.replaceAll("<%LAST_ACTIVE%>", user.lastActive.toUTCString());
    html = html.replaceAll("<%LAST_ACTIVE_AGO%>", timeSince(user.lastActive));
    return this.constructHTML(html);
  }

  async errorPage(msg: string, title = "Error"): Promise<string> {
    let html = await readFile(join(__dirname, "../static/error.html"), "utf-8");
    html = html.replace("<%TITLE%>", title);
    html = html.replace("<%MSG%>", msg);
    return this.constructHTML(html);
  }
}
