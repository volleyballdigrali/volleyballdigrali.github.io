// The complete setup and how-to guide, built into the app.

import { $$ } from "../ui.js";

const SECTIONS = [
["what", "What the app does", `
<p>The Team app tracks your volleyball team on your phone (iPhone or Android): the roster, the season schedule, and serve and serve-receive stats during matches. Each coach can use it on their own phone. A program on your PC called <b>Home Base</b> keeps the master database for the whole club and collects everyone's data. It's optional; to set it up, see <a href="https://volleyballdigrali.github.io/home-base/" target="_blank" rel="noopener">Get Home Base</a>.</p>
<ul>
  <li><b>Serve:</b> Ace, In, Out for each serve.</li>
  <li><b>Receive:</b> rate each pass 0, 1, 2 or 3 (3 = perfect, 2 = good, 1 = poor but playable, 0 = shanked, overpassed or aced).</li>
  <li><b>Attack:</b> Kill, In play, Error; <b>Block:</b> Solo, Assist, Error; <b>Set:</b> Assist, Error.</li>
  <li><b>Court:</b> the lineup by position, rotation, substitutions and the libero rules; it also counts each player's playing time.</li>
  <li><b>Schedule:</b> every match of the year with day, date, opponent, location and optional time.</li>
  <li><b>Team:</b> teams, coaches, the club's players and each team's roster.</li>
  <li><b>Stats:</b> by match, by set or for the season, including playing time.</li>
  <li><b>Sync:</b> send data to Home Base and bring in data from it or from other coaches.</li>
</ul>`],

["install", "Put the app on your phone", `
<p><b>iPhone:</b></p>
<ol>
  <li>Open <b>Safari</b> and go to <code>volleyballdigrali.github.io/team/</code>, or scan the QR code on Home Base's <b>Add a coach</b> page with the Camera. It must open in Safari.</li>
  <li>Tap <b>Share</b> (square with an up arrow), then <b>Add to Home Screen</b>, then <b>Add</b>.</li>
  <li>Open <b>Team</b> from the Home Screen. (If you already open it from a <b>Volleyball Digrali</b> icon, keep doing that: your data lives there.)</li>
  <li>Always open the app the same way. Data saved from the Home Screen icon is separate from data in Safari itself.</li>
</ol>
<p><b>Android:</b></p>
<ol>
  <li>Open <b>Chrome</b> and go to <code>volleyballdigrali.github.io/team/</code>, or scan the QR code on Home Base's <b>Add a coach</b> page.</li>
  <li>Tap the <b>⋮</b> menu, then <b>Install app</b> (or <b>Add to Home screen</b> → <b>Install</b>).</li>
  <li>Open <b>Team</b> from the Home screen. It opens full screen like any other app, and syncs with Home Base and the other phones the same way.</li>
</ol>
<p><b>Team password:</b> the app asks for it each time it opens, and again when you come back after 5 minutes or more. Capital letters don't matter. Your head coach gives it to you. It's a simple lock to keep strangers out, not a vault: your data never leaves your phone and your own PC either way.</p>
<p>After you've opened it once, the app works with no internet at the gym. When a new version is posted, a bar at the bottom says <b>New version available</b>; tap <b>Update</b>. Your data stays. To check right away, use <b>More → Check for updates</b>.</p>
<p><b>Version numbers</b> (top of the screen) work like v1.2.3: the first number changes for a big release (v2.0 will be the App Store version), the middle one for a new feature, and the last one for a small fix. Home Base on the PC has its own number in the same style. After an update the app shows <b>What's new</b> once; tap the version number any time to see it again.</p>`],

["terms", "Free, open source, and the terms", `
<p>Volleyball Digrali is free and open source (MIT License), made by the Volleyball Digrali contributors. The first time the app opens on a phone, a short welcome explains what it does, how and why to install it on the Home Screen, and the terms of use, which you agree to before starting. If the terms ever change, the app asks you to review them once.</p>
<p>In short: it's provided as is, with no warranty; your data stays on your phone and your own PC and is never sent to the authors; you're responsible for your backups; and you need permission from your club and players' parents or guardians to record players' information. Read everything, see when you agreed, or replay the welcome on <b>More → About &amp; terms</b>.</p>`],

["setup", "First-time setup", `
<ol>
  <li><b>Name this device</b> when the app asks, for example <i>Head coach phone</i>. Change it later on More → Sync.</li>
  <li><b>Create your team</b> on More → Team: team name, season and <b>age group</b> (13s, 17s and so on). Players play in the age group of the team they're on.</li>
  <li><b>Coaches:</b> fill in the head coach and up to three assistant coaches on the same page.</li>
  <li><b>Players:</b> tap <b>+ New player</b>, or <b>Import CSV…</b> to load a whole list (see the next section). New players are added to the club list and to the team you're working with.</li>
  <li><b>Roster:</b> players already in the club list can be added with <b>+ Add from club list</b>. Tap a roster player to change her number, position or <b>rotation count</b> on this team, or to remove her from the team. Set the libero's position to <b>Libero</b> so the court rules know her.</li>
  <li><b>Attack:</b> Kill, In play, Error; <b>Block:</b> Solo, Assist, Error; <b>Set:</b> Assist, Error.</li>
  <li><b>Court:</b> the lineup by position, rotation, substitutions and the libero rules; it also counts each player's playing time.</li>
  <li><b>Schedule:</b> on the Schedule tab, tap <b>+ Add match</b> for each match: date, optional time, opponent, location, and an optional event or tournament name. The day of the week is filled in for you.</li>
</ol>
<p>Setting up a second team? Tap <b>+ New team</b> on the Team page. When there's more than one team, a <b>Working with</b> menu picks which one the other tabs show.</p>
<p>Already set up on another phone or in Home Base? Skip all of this: import the setup file (More → Sync → Import file).</p>`],

["csv", "Player CSV files", `
<p>One player per line. With a header row, the columns can be in any order:</p>
<pre>First Name,Last Name,Number,Position,Team
First1,Last1,7,Setter,13U Gold
First2,Last2,12,Pin,13U Gold
First3,Last3,3,Libero,12U Blue</pre>
<ul>
  <li>Without a header, the order must be: first name, last name, number, position, team. Other columns, such as age or birth date, are ignored: the app doesn't keep them.</li>
  <li><b>On the PC:</b> Home Base can import the same file (Dashboard → <b>Import players</b>), with a blank template to fill in and a preview before anything is saved.</li>
  <li>Only first name is required. Positions: Setter, Pin, Middle, Right Side, Libero, DS.</li>
  <li><b>Team</b> puts each player on that team, creating the team if it doesn't exist. With no Team column, players go on the team you're working with.</li>
  <li>Players already in the club list (same first and last name) aren't added twice.</li>
  <li>Tryouts: put tryout numbers (101, 102…) in the Number column, or in First Name if you don't know names yet.</li>
  <li>In Excel use <b>Save As → CSV</b>. To get the file onto your phone, email it to yourself and save the attachment (on an iPhone: Share → <b>Save to Files</b>; on Android it goes to Downloads).</li>
</ul>`],

["match", "Match day", `
<ol>
  <li>On <b>Schedule</b>, tap the match and choose <b>Track this match</b>.</li>
  <li>The first time, choose how to keep score:
    <ul>
      <li><b>Every point:</b> tap <b>Point us</b> or <b>Point them</b> after each rally. Some taps score the rally for you, so don't also tap a point button for them: an <b>Ace</b>, <b>Kill</b> or <b>Solo block</b> scores for you; a serve <b>Out</b>, attack <b>Error</b>, block <b>Error</b> or set <b>Error</b> scores for them. (For a block <b>Assist</b>, tap Point us once.) You get a running score, set scores fill in by themselves, and side outs are counted.</li>
      <li><b>Final set scores only:</b> no point buttons; type each set's score when it ends.</li>
    </ul></li>
  <li>In a point-by-point match, answer <b>Who serves first?</b> at the start of each set.</li>
  <li><b>Court</b> (button in the dark match bar, or More → Court): tap a bench player, then a court position, for each of the starting six. See the next section.</li>
  <li><b>Serve tab:</b> the player at position 1 is picked for you when the court is set; otherwise tap the server. Then <b>Ace</b>, <b>In</b> or <b>Out</b>. On Serve, Receive and Net Play the players on the court are laid out just like the Court tab (4 3 2 front, 5 6 1 back), with the bench below.</li>
  <li><b>Receive tab:</b> tap the passer (players on the court are listed first), then <b>0</b>–<b>3</b>.</li>
  <li><b>Net Play tab:</b> choose <b>Attack</b>, <b>Block</b> or <b>Set</b> at the top, tap the player, then the result. <b>Shared block:</b> on Block, tap both blockers, then <b>Assist</b> once. Each gets an assist (half a block), the point is scored for us, and Undo removes it all together. Tap a selected player again to unselect her. Blockers are cleared after each block.</li>
  <li><b>Did it count?</b> Every tap flashes the button with a ✓, shows a green badge on the player (for example "✓ Ace"), and a coloured bar under the buttons says what was recorded and the score. If you don't see them, it didn't go in.</li>
  <li><b>Undo last</b> removes the last tap you made on this phone in this match, including a point it scored and a rotation it caused.</li>
  <li><b>Set ▾</b> finishes a set: check or type its score and start the next set, or end the match. Each new set starts with an empty court.</li>
</ol>
<p>The match bar stays at the top of Serve, Receive, Net Play and Court, so you can switch between them during play. To fix scores later, open the match on Schedule and tap <b>Set scores</b>. An ended match can be reopened.</p>
<p><b>Two coaches at one match</b> can both track (for example one on Serve and Receive, one on Net Play). Only one of you should run the Court and tap the point buttons.</p>`],

["court", "The Court tab", `
<ul>
  <li><b>Lineup:</b> tap a bench player, then a position. If someone was there she goes to the bench; that's a substitution (filling an empty spot isn't). Tap a player on the court to select her, then <b>Take off court</b>.</li>
  <li><b>Positions:</b> the court is numbered 1 to 6 (1 is the server, back right); positions carry no role, since any player can start anywhere. Each box shows the player and her own position from the roster (Setter, Pin, Middle…).</li>
  <li><b>Rotate</b> moves everyone clockwise (4→3, 3→2, 2→1, 1→6, 6→5, 5→4). In point-by-point matches the court rotates by itself when you win a rally on their serve (a side out). Turn that off with <b>Rotate on side outs</b>.</li>
  <li><b>Rotate back</b> moves everyone one spot the other way (1→2 … 6→1), for fixing a lineup that got ahead. Right after a Rotate that made planned subs, it undoes those subs too, so everyone is back exactly where they were.</li>
  <li><b>Undo lineup change</b> steps back through lineup changes, restoring the substitution count too. It never removes recorded stats.</li>
  <li><b>Substitutions:</b> 15 per set, shown at the top. Changes involving the libero don't count. After 15, counted substitutions are blocked.</li>
  <li><b>Libero in the front row:</b> a red notice appears and Rotate is off until you bring someone in for her: just tap a bench player.</li>
  <li><b>Rotation count 3:</b> when a player set to 3 crosses between the back and front rows, the app asks whether to substitute. Tap a bench player, or <b>Keep anyway</b>.</li>
  <li><b>Libero for a Middle:</b> when a Middle reaches position 1 (after rotating, or after you lose the serve) and the libero is on the bench, the app offers to bring the libero in.</li>
</ul>`],

["board", "Match-day board", `
<p>Tap <b>Board</b> next to the score in the dark match bar (or More → <b>Board</b>) to see, at a glance, who is doing well and who is struggling today. Tap Board again to go back.</p>
<ul>
  <li>Switch between <b>Serve</b> (serve %), <b>Pass</b> (average 0–3) and <b>Attack</b> (hitting %), and between <b>this set</b> and the <b>whole match</b>.</li>
  <li>One bar per player, <b>weakest at the top</b>. Red, amber and green follow the key under the list: pass under 1.5 / 1.5–2.0 / 2.0 and up; serve under 70% / 70–85% / 85% and up; hitting under .000 / .000–.150 / .150 and up.</li>
  <li>The small number after each value is how many tries she's had, so you can tell one bad serve from a bad day. A green dot means she's on the court now.</li>
</ul>`],

["scout", "Scouting other teams", `
<p>More → <b>Scout</b> lets you watch another match (or your opponent warming up) and rate their passers 0–3, so you know who to serve at. Scouting stays separate from your own players and stats.</p>
<ol>
  <li>Tap <b>+ New scouting match</b>. Type Team 1 and Team 2 (teams you've scouted before appear as you type, and come back with their numbers and notes). Add the date and location if you like.</li>
  <li>Tap the numbers you see for Team 1 on the <b>0–99 grid</b>, then <b>Next</b>, then the same for Team 2.</li>
  <li>Switch teams at the top. Tap a number, then <b>0</b>, <b>1</b>, <b>2</b> or <b>3</b> for her pass. <b>Undo last</b> removes your last rating. <b>+ #</b> adds a number you missed. Each rating flashes like the match screens.</li>
  <li><b>✎ Position &amp; notes</b> (after tapping a number) adds her position and a comment such as "hits line" or "tips a lot", before or during the match.</li>
  <li>Tap <b>Done</b> when the match is over. Every rating is already saved; Done just takes you back to the Scout list. Tap the match there to add more or see its report.</li>
  <li><b>Report</b> shows each team's passers, weakest first, with position and comment. <b>Copy for email</b> copies it.</li>
</ol>
<p>From the Scout list, tap a scouted team to see every pass you've rated for them this season. Scouting syncs to Home Base (its <b>Scouting</b> page) and to other coaches like everything else. At the end of the season, <b>Clear old scouting</b> removes all of it.</p>`],

["rotation", "Rotation wheel and substitution plan (trial)", `
<p>More → <b>Rotation</b> (or <b>Wheel</b> in the dark match bar) shows the court as a wheel: the six positions around the circle, front row on top, coloured like a tracker card: when play starts, position 1 (the first server) is <b>red</b>, the front row (4, 3, 2) <b>green</b>, and positions 5 and 6 <b>white</b>. The colours turn with the players as you rotate, so the red slice always shows where the set started. <b>L</b> marks the libero and <b>↻</b> a sub. A <b>Clear plan</b> button removes all planned swaps for the set. The middle shows which rotation you're in (1 = the set's starting lineup).</p>
<ol>
  <li>Set the starting six on the <b>Court</b> tab as usual.</li>
  <li>On <b>Rotation</b>, tap a slice (or <b>+ Plan a swap</b>): choose the <b>front-row player</b>, who <b>replaces her in the back row</b> (a bench player or the libero), and <b>when</b>:
    <b>To serve</b> (as her spot rotates to position 1, so the sub serves) or <b>After she serves</b> (she serves; the sub comes in when we lose her serve).</li>
  <li>The front-row player comes back automatically when her spot rotates to the front row (position 4). The libero always leaves before the front row.</li>
  <li>From then on, <b>Rotate</b>, side outs and losing the serve make those subs for you and show what happened, with <b>OK</b> or <b>Undo these subs</b>.</li>
</ol>
<p><b>The libero doesn't serve</b> unless you choose "To serve" for her (for one player at most). Libero swaps don't count toward the 15 substitutions; others do, and planned subs are skipped once all 15 are used. Each new set starts with the same plan, and a <b>new match starts with the plan your team used last</b>. The Serve and Receive tabs also have a <b>Rotate</b> button (in every-point matches that already rotate on side outs, it asks first). Subs you make by hand are respected: a planned swap is skipped if a player isn't where the plan expects. <b>Next Rotate</b> under the wheel shows what the next Rotate will do. <b>Court vs. plan</b> lists anywhere the players on the court don't match the plan (for example a sub still in the front row) with a <b>Fix</b> button.</p>`],

["work", "Work rotation", `
<p>When your team works as officials (score keeper, libero tracker, scoreboard, line judges, swing helper), More → <b>Work</b> keeps the jobs fair.</p>
<ol>
  <li>Tap <b>+ Record work</b>. The date fills in; add the match or court if you like.</li>
  <li>Each player is suggested the job after her last one. With more than 10 players, the extras are <b>Off</b> this time and rotate in next time. The first time, jobs go in jersey order.</li>
  <li>Change any job, or set a player to <b>Absent</b> (she keeps her place for next time). A red note warns if two players have the same job or a job has nobody.</li>
  <li>Tap <b>Save</b>. The <b>Who did what</b> table shows each player's job every time the team worked, newest first, using short codes: Score, LibTr (Libero tracker), Board (Scoreboard), LJ1A to LJ3B (line judges), Swing, Off, Abs. The key is under the table. Below it, <b>How many times each job</b> counts each player's jobs, Off and Abs, so you can see at a glance who has done what.</li>
</ol>
<p>Tap a date at the top of the table to fix or delete that record. Deleting puts the rotation back where it was.</p>`],

["links", "Links", `
<p>More → <b>Links</b> keeps the web pages you use often: tournament sites, rules, the club calendar. Tap <b>+ Add link</b>, give it a title and web address, and optionally a group such as Tournaments. Tap a link to open it. On an iPhone it opens in a Safari window; tap the compass icon there to move it to the full Safari app. On Android it opens in Chrome. To use another browser such as Chrome, tap <b>Copy</b> and paste the address there. Tap <b>Edit</b> to change or delete a link. Links you add in Home Base's setup file reach every coach's phone.</p>`],

["stats", "Stats", `
<p>More → Stats shows each player for the season, one match, or one set. Switch views at the top:</p>
<ul>
  <li><b>Serve &amp; pass:</b> serves, aces, in, out, serve % (aces plus in, out of all serves), passes and average pass. Shaded: more than 3 serves and over half out, or more than 3 passes averaging under 1. Point-by-point matches also show the team's side-out %.</li>
  <li><b>Attack:</b> kills, errors, attempts, and hitting % = (kills − errors) ÷ attempts.</li>
  <li><b>Block &amp; set:</b> solo blocks, block assists, total blocks (solo + half of each assist), block errors, set assists and set errors.</li>
  <li><b>Playing time:</b> sets, rotations and rallies on the court for each player, and her share of all rallies. Players well below the team's middle player are shaded. This is your record if a parent asks about playing time; it's counted from the Court tab, so keep the lineup current during matches.</li>
</ul>
<p><b>Player card:</b> tap a player's name for her card: <b>Serve %</b> and <b>Serve receive</b> on gauges (red, yellow, green, with a needle at the exact value) plus her other numbers, for the season, a match or a set.</p>
<p><b>Colour levels:</b> how strict red, yellow and green are depends on the team. Choose <b>Young / developing</b>, <b>Intermediate</b>, <b>Advanced</b> or <b>Custom</b> when you create a team or on <b>More → Team</b>. The gauges, the Board, scouting and Home Base's charts all follow it, and it goes to the other coaches in the setup file.</p>
<p><b>Copy for email</b> copies the table you're looking at; paste it into an email. <b>Export to Excel</b> saves every recorded tap as a CSV file.</p>`],

["sync", "Syncing with Home Base and other coaches", `
<p>Every phone keeps its own copy of the data. Sync files move data between phones and the PC. Each record has its own ID, so merging never loses anything:</p>
<ul>
  <li>New records are added. A record changed more recently replaces the older copy. Anything else is left alone.</li>
  <li>Deleting a player or match sends that deletion along too, so it doesn't come back.</li>
  <li>Importing the same file twice changes nothing.</li>
</ul>
<p><b>Phone to PC (after each match or tournament):</b></p>
<ol>
  <li>More → Sync → <b>Export sync file</b>.</li>
  <li>Send it to yourself: AirDrop, Mail or Outlook. Once Home Base has it, delete the file from the phone and from your mail: it holds players' names.</li>
  <li>In Home Base on the PC, import it (or save it into Home Base's <b>inbox</b> folder).</li>
</ol>
<p><b>PC to phones (to share the roster and schedule):</b></p>
<ol>
  <li>In Home Base, click <b>Download setup file</b> and email it to each coach.</li>
  <li>On the phone: save the attachment to Files, then More → Sync → <b>Import file</b>.</li>
</ol>
<p>Coaches can also swap sync files directly with each other the same way.</p>
<p><b>Locked files:</b> every sync and setup file is locked with the club's <b>file password</b>, which the head coach sets on Home Base (Dashboard, <b>File password</b>). Opened anywhere else, a file is unreadable. The first time you export or import, the app asks for the password; tick <b>Remember on this phone</b> so it doesn't ask again. Each file is locked with brand-new keys, and a file that isn't locked, or was changed after it was made, is refused. When the head coach changes the password, the next setup file passes the new one to your phone. To clear it from a phone: More → Sync → <b>Forget the password</b>.</p>
<p>Tell coaches the file password yourself, in person or by phone, never in the same message as a file.</p>`],

["homebase", "Home Base on the PC", `
<ol>
  <li>Install Python 3 from python.org. On the first installer screen, tick <b>Add python.exe to PATH</b>.</li>
  <li><b>Quickest:</b> open PowerShell and run <code>irm https://volleyballdigrali.github.io/home-base/install.txt | iex</code>. It sets up <code>C:\vb-home-base</code> and a Desktop shortcut. Or follow the steps on the <a href="https://volleyballdigrali.github.io/home-base/" target="_blank" rel="noopener">Get Home Base</a> page.</li>
  <li>Doing it by hand: put the <code>vb-home-base</code> folder somewhere permanent on the PC itself, such as <code>C:\vb-home-base</code>. Keep it out of OneDrive and other cloud-synced folders (including Documents or Desktop if OneDrive backs them up): the database holds players' names.</li>
  <li>Double-click <code>start-home-base.bat</code>. Leave the black window open; your browser opens Home Base at <code>http://localhost:8770</code>.</li>
  <li>The Dashboard imports files, downloads setup files, and lists recent imports. The tabs across the top hold the reports: season stats, player cards, match reports, rotations, trends, playing time, results, schedule, work and scouting, each with filters, Excel download and print.</li>
  <li><b>Updates:</b> the Dashboard says when a new Home Base is available; click <b>Update now</b>. It backs up the database and the old program first, then restarts itself.</li>
  <li><b>Add a coach:</b> that tab shows a QR code that opens the app on a new coach's phone, the install steps (print it as a handout), and a button for the setup file to send them. On your phone, <b>More → Share the app</b> shows the same QR code for another coach to scan right off your screen.</li>
</ol>
<p><b>Club logo:</b> on the Home Base dashboard, under <b>Club logo</b>, choose the image (PNG or JPG). It goes out in the next <b>setup file</b>, so each phone shows it in the app's header after importing; it also appears on Home Base's pages and at the top of emailed stats. The Home Screen icon is separate: click <b>Download app icon</b>, upload the three files it saves (<code>icon.png</code> for iPhones and iPads, <code>icon-192.png</code> and <code>icon-512.png</code> for Android) into the <code>team</code> folder on GitHub, and each phone re-adds the app to the Home Screen once.</p>
<p>The master database is <code>volleyball.db</code> in that folder: a normal SQLite file you can open with DB Browser for SQLite. Home Base keeps a copy of every imported file in <code>imports</code> and a daily backup of the database in <code>backups</code>.</p>`],

["club", "Using the app for another team or club", `
<p>Friends coaching other teams can use the same app. Nothing needs to be copied or changed: each club's data stays on its own phones and its own PC.</p>
<ul>
  <li><b>Another team in your club:</b> on More → Team tap <b>+ New team</b>, and pick it in the <b>Working with</b> menu. Each team has its own roster, schedule, colour levels and planned swaps. One Home Base holds every team in the club.</li>
  <li><b>Another club:</b> send their coach the app link (More → Share the app). They start fresh: the welcome, then <b>New team</b>. Never send them your setup or sync files: those carry your players' names.</li>
  <li><b>Their own Home Base:</b> one per club, on their own PC, from the <a href="https://volleyballdigrali.github.io/home-base/" target="_blank" rel="noopener">Get Home Base</a> page. It starts empty and only ever holds the files their coaches send it.</li>
  <li><b>One coach, two clubs:</b> keep each club on its own Home Base. On the phone, both can live side by side as separate teams; export with care, since a sync file from that phone carries both.</li>
  <li><b>Updates</b> come to everyone at once from the same site. Each club agrees to the terms of use on its own phones and PC.</li>
</ul>`],

["data", "Keeping your data safe", `
<ul>
  <li>Export a sync file after every match. Once Home Base has it, it's backed up.</li>
  <li>Deleting the app's icon from the Home Screen can delete the data saved in it. Export first.</li>
  <li>More → Sync shows how many records are on this phone and when you last exported.</li>
</ul>`],

["trouble", "Troubleshooting", `
<ul>
  <li><b>The Serve tab picks the wrong server:</b> the court is out of step. Fix it on the Court tab (Rotate or Undo lineup change).</li>
  <li><b>No players show on Serve or Receive:</b> add players to this match's team on More → Team.</li>
  <li><b>"No match selected":</b> tap the match on Schedule, then <b>Track this match</b>.</li>
  <li><b>The roster or schedule disappeared:</b> the app was opened a different way (Safari instead of the Home Screen icon) or on another phone. Use the same icon, or import a setup file.</li>
  <li><b>The CSV is greyed out when importing:</b> it isn't saved as .csv. Save it from Excel as CSV.</li>
  <li><b>"This isn't a Team app sync file":</b> import only files exported from this app or Home Base.</li>
  <li><b>The screen dims during a drill:</b> Settings → Display &amp; Brightness → Auto-Lock → Never.</li>
</ul>`],

["next", "Coming next", `
<ul>
  <li><b>Last step:</b> a simple way to roll the app out to other coaches, and an App Store version.</li>
</ul>`],
];

export function render(main) {
  main.innerHTML = `<section class="card guide"><h2>Guide</h2>
      <div class="toc">${SECTIONS.map(([id, t], i) => `<button type="button" class="item" data-to="${id}" style="padding:8px 4px">
        <span class="main-txt">${i + 1}. ${t}</span><span class="chev">›</span></button>`).join("")}</div></section>
    ${SECTIONS.map(([id, t, body], i) => `<section class="card guide" id="g-${id}"><h3>${i + 1}. ${t}</h3>${body}</section>`).join("")}`;
  for (const b of $$("[data-to]", main)) b.onclick = () => document.getElementById("g-" + b.dataset.to)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
