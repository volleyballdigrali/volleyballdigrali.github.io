// Table definitions for the Team app. Home Base (home_base.py) uses the same tables and columns.
// To add a field later: add it to the list here and in home_base.py. Old rows simply don't have it yet.
// Every table also has the COMMON columns, which make syncing between devices safe.

export const APP_VERSION = "v1.14";
export const MAKER = "Volleyball Digrali dgr-0b1e-ace5";   // written into every sync file

// "What's new" notes, newest first. Shown once after an update, and any time by tapping the version number.
export const RELEASE_NOTES = [
  ["v1.14", [
             "New on the main menu: Side-out, a quick volleyball word game. Guess the word in 6 tries to win the rally; first to 5.","New license: Volleyball Digrali stays free for every coach and club, but nobody may use its code to make a competing product, sold or free (PolyForm Shield License). The terms of use were updated, so you're asked to agree once more.",
               "The Rotation screen now uses the team's own substitutions per set (12, 15 or 18), like the Court tab and the match bar."]],
  ["v1.13.1", ["On iPhone, the top of the app no longer sits under the time and battery. If it still does, close the app completely and open it again."]],
  ["v1.13", ["New web address: volleyballdigrali.github.io/team. If your app came from the old address, it shows how to move your data across.",
             "Schedule: Add to calendar makes a calendar file of the upcoming matches (or the whole season) for your phone's calendar.",
             "The match bar shows the substitutions used in the set (for example 9 of 15 subs used), and turns yellow, then red, near the limit.",
             "Team: set your league's substitutions per set (12, 15 or 18).",
             "A reminder appears when this phone's data hasn't been exported for 30 days (never during a match).",
             "The back button at the top now says Home menu."]],
  ["v1.12", ["The volleyball intro now plays when the Team app opens, before the password, however the app was installed. Tap to skip it."]],
  ["v1.11", ["New name: Volleyball Digrali (dig + rally). The web address is now pbbergs.github.io/Volleyball-Digrali.",
             "More → About & terms: a Support on Ko-fi button, for anyone who wants to buy the developer a coffee.",
             "The terms of use were updated for the new name, so you're asked to agree once more."]],
  ["v1.10", ["Sync and setup files are now locked with the club's file password (set by the head coach on Home Base). The app asks for it the first time you export or import, and can remember it. Files that aren't locked are refused.",
             "More → Sync shows whether the password is remembered, with a button to forget it."]],
  ["v1.9", ["The app is now in the club colours: red, gray, black and white, with a red app icon. The icon already on your Home Screen may keep its old colour, and that's fine: don't remove it just for the colour, because removing it can delete the app's data.",
            "Guide: keep Home Base out of OneDrive and other cloud folders, and delete sync files from your phone and mail once Home Base has them."]],
  ["v1.8", ["Teams have an age group (10s to 18s) on More → Team. Players play in the age group of the team they're on.",
            "Players no longer have an age or birth date: the fields are gone and any stored ones were erased from this phone.",
            "Home Base can now import players from a CSV file too, with a template and a preview."]],
  ["v1.7", ["The app now asks for the team password each time it opens (and after 5 minutes away). Ask your head coach for it.",
            "The Volleyball Digrali pages ask search engines not to list them."]],
  ["v1.6.3", ["Guide: a new section, Using the app for another team or club.",
              "Home Base installs with one line in PowerShell (see Get Home Base or the Guide), with a Desktop shortcut.",
              "The Volleyball Digrali page opens with a volleyball flying at you. Tap the title to see it again."]],
  ["v1.6.2", ["Get Home Base: a new page on the Volleyball Digrali site with setup steps and downloads for the PC program. Linked from Share the app and the Guide."]],
  ["v1.6.1", ["Check for updates: on the More menu and on About & terms, it tells you right away whether a new version is out.",
              "Rotate back right after a Rotate that made planned subs now undoes those subs too, so everyone is back exactly where they were."]],
  ["v1.6", ["Colour levels per team (More → Team, and when you create a team): Young, Intermediate, Advanced or Custom, for how strict red, yellow and green are.",
            "Tap a player on Stats for her card: serve % and serve receive on gauges, with a needle at the exact value.",
            "Rotation tab: Court vs. plan lists where the court doesn't match your planned swaps, with a Fix button."]],
  ["v1.5.2", ["Court positions no longer carry fixed roles (the setter can start anywhere); each box shows the player's own position from the roster.",
              "On the wheel, the libero's slice shows whom she is covering."]],
  ["v1.5.1", ["Fixed: when the libero rotates from 5 to 4 and is planned to come in at 1 on the same rotate, she now leaves at 4 and comes in at 1.",
              "The Rotation tab's Rotate button is up next to the heading."]],
  ["v1.5", ["Planned swaps are remembered: a new match starts with the plan your team used last. Change it or Clear plan any time.",
            "Serve and Receive tabs have a Rotate button (with your planned subs). In every-point matches that already rotate on side outs, it asks first."]],
  ["v1.4.4", ["The wheel uses tracker-card colours: when play starts, position 1 is red, the front row green and 5 and 6 white, and the colours turn with the players. L marks the libero, ↻ a sub.",
              "Clearer swap messages with names (including the same pair planned twice, or the other way round), and a Clear plan button."]],
  ["v1.4.3", ["Fixed: changing an existing planned swap (for example switching the two players around) no longer says they are already in another swap. New ⇅ Switch the two players button in the swap editor."]],
  ["v1.4.2", ["Rotation messages now show each player's number, name and position, and where she is on the court, so you can see exactly why a planned swap was skipped."]],
  ["v1.4.1", ["Rotation plan: when it's the libero's turn to serve and she's already in the back row for someone else, she moves to position 1 and that player comes back in.",
              "Only the libero can switch in for more than one player; the swap editor won't allow it for anyone else."]],
  ["v1.4", ["Try it: the Rotation wheel (More → Rotation, or Wheel in the match bar) shows who is where, colour-coded by position.",
            "Plan who goes in for who and when: Rotate (and side outs) then make those subs for you, with OK / Undo. The libero only serves if you choose that."]],
  ["v1.3", ["New coaches get a proper welcome: what the app does, how and why to install it on the Home Screen, and the terms of use.",
            "Volleyball Digrali is now free and open source (MIT License). Read the terms any time in More → About & terms."]],
  ["v1.2", ["More → Share the app: a QR code another coach scans from your screen to get the app, plus a Share link button. Works with no internet."]],
  ["v1.1", ["This note: after each update the app shows what changed, once. Tap the version number at the top to see it again.",
            "Home Base can now update itself, and has an Add a coach page with a QR code that opens this app on a new coach's phone."]],
  ["v1.0.2", ["Wording says \"phone\" instead of \"iPhone\" wherever it applies to both iPhone and Android."]],
  ["v1.0.1", ["Android: install the app from Chrome (⋮ → Install app)."]],
  ["v1.0", ["New version numbers: v1.2.3 = big release . new feature . small fix."]],
];
// Fields that are no longer kept: erased from this device on start-up and ignored in any file imported.
export const DROPPED = { players: ["age", "birth_date"] };
// Age groups a team can be set to.
export const AGE_GROUPS = ["10s", "11s", "12s", "13s", "14s", "15s", "16s", "17s", "18s"];
export const SCHEMA_VERSION = 2;          // bump when a new table is added
export const SYNC_FORMAT = "vbteam-sync";
export const SYNC_FORMAT_VERSION = 1;

export const COMMON = ["id", "created_at", "updated_at", "device", "deleted"];

export const TABLES = {
  teams:     ["name", "season", "notes", "levels", "age_group", "sub_limit"],
  staff:     ["team_id", "role", "first", "last", "phone", "email"],
  players:   ["first", "last", "number", "position", "notes"],
  roster:    ["team_id", "player_id", "number", "position", "rot"],
  matches:   ["team_id", "date", "time", "opponent", "location", "event", "status", "scoring", "cur_set", "notes"],
  sets:      ["match_id", "set_no", "us", "them"],
  actions:   ["match_id", "set_no", "player_id", "skill", "result", "tap", "us", "them", "court_pos", "serving", "lineup", "rot_no"],
  court_log: ["match_id", "set_no", "player_id", "court_pos", "event", "us", "them", "lineup", "rot_no", "subs", "tap"],
  duties:    ["name", "sort"],
  work_log:  ["team_id", "match_id", "player_id", "duty_id", "status", "session", "date", "label", "slot"],
  links:     ["title", "url", "category", "sort"],
  settings:  ["key", "value"],
  // Scouting other teams (kept apart from your own teams and stats)
  scout_teams:   ["name", "notes"],
  scout_players: ["scout_team_id", "number", "position", "comment"],
  scout_matches: ["date", "team1_id", "team2_id", "location"],
  scout_passes:  ["match_id", "scout_team_id", "scout_player_id", "rating", "tap"],
};


export const POSITIONS = ["Setter", "Pin", "Middle", "Right Side", "Libero", "DS"];
export const ROT_COUNTS = ["", "3", "6"];
export const DEFAULT_ROLES = { 1: "Setter 1", 2: "Pin 1", 3: "Middle 1", 4: "Opposite 1", 5: "Pin 2", 6: "Middle 2" };
// Short column labels for the work matrix, by duty order.
export const DUTY_SHORT = ["Score", "LibTr", "Board", "LJ1A", "LJ1B", "LJ2A", "LJ2B", "LJ3A", "LJ3B", "Swing"];
export const STAFF_ROLES = ["Head coach", "Assistant coach 1", "Assistant coach 2", "Assistant coach 3"];

// skill -> allowed results, in button order
export const SKILLS = {
  serve:   ["ace", "in", "out"],
  receive: ["0", "1", "2", "3"],
  attack:  ["kill", "in play", "error"],
  block:   ["solo", "assist", "error"],
  set:     ["assist", "error"],
  point:   ["us", "them"],
};

// The 10 officiating duties, in rotation order. Fixed ids so every device shares the same rows.
export const DUTIES = [
  "Score keeper", "Libero tracker", "Scoreboard",
  "Line Judge 1A", "Line Judge 1B", "Line Judge 2A", "Line Judge 2B", "Line Judge 3A", "Line Judge 3B",
  "Swing Helper",
].map((name, i) => ({
  id: "duty-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name, sort: i + 1,
  created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", device: "seed", deleted: 0,
}));
