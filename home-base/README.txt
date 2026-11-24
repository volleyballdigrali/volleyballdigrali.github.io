VOLLEYBALL HOME BASE
====================
Home Base keeps the club's master database (volleyball.db) on this PC. Coaches track matches
in the Team app on their phones, export a sync file, and Home Base merges it in. Home Base can
also make a setup file (teams, players, rosters, schedule, links) for the phones.

QUICK INSTALL (ONE LINE)
Install Python 3 first (step 1 below). Then open PowerShell, paste this line and press Enter:

    irm https://volleyballdigrali.github.io/home-base/install.txt | iex

It makes C:\vb-home-base, downloads the program files, unblocks them, adds a Home Base shortcut
to the Desktop and offers to start it. Running it again updates the program; your data stays.
Setup steps and downloads: https://volleyballdigrali.github.io/home-base/

ONE-TIME SETUP (BY HAND)
1. Install Python 3 from https://www.python.org/downloads/ (version 3.7 or newer).
   On the first installer screen, tick "Add python.exe to PATH".
2. Put this whole vb-home-base folder somewhere permanent on the PC itself, for example C:\vb-home-base.
   Keep it OUT of OneDrive, Dropbox, Google Drive or iCloud, and out of Documents or Desktop if OneDrive
   backs those up: the database holds players' names, and a synced folder copies it to that company's cloud.

WINDOWS ASKS "DO YOU WANT TO RUN THIS FILE?"
Windows asks this the first time you open a .bat file that came from the internet. It is safe
to click Run. To stop the question for good, unblock the files once. In PowerShell:

    Get-ChildItem C:\vb-home-base -Recurse -Include *.bat,*.ps1,*.py | Unblock-File

(or right-click each .bat file > Properties > tick "Unblock" at the bottom > OK).
Do this again after copying in files you downloaded. Home Base's own "Update now" doesn't need it.

EVERY TIME
1. Double-click start-home-base.bat. A black window opens; leave it open.
2. Your browser opens http://localhost:8770 (if not, type that address yourself).
3. To stop Home Base, close the black window.

IMPORT PLAYERS FROM A SPREADSHEET
- Dashboard > Import players > Download blank template (First Name, Last Name, Number, Position, Team).
- Fill it in, save as CSV, choose it and click Preview. Check the preview, then Import these players.
- Players already here (same first and last name) are updated, not added twice. Then send the setup file.

FILE PASSWORD (LOCKED FILES)
- Every sync and setup file is locked with the club's file password. Set it once on the Dashboard (File password),
  then tell it to your coaches yourself: never in the same message as a file.
- Files that aren't locked, or were changed after they were made, are refused.
- Change it any time on the Dashboard. Files made before the change still open here, and the next setup file
  passes the new password to the phones (untick that option if the old password got out).

IMPORT DATA FROM A PHONE
- On the phone: Team app > More > Sync > Export sync file, and send it to yourself.
- On the PC: Dashboard > choose the file > Import.
  Or save the file into the "inbox" folder: it is imported the next time Home Base starts,
  or when you click "Import inbox folder".
- Newer changes win. Importing the same file twice changes nothing. Nothing is ever deleted
  because a file doesn't mention it.

SEND DATA TO THE PHONES
- Dashboard > Download setup file. Send it to each coach.
- On the phone: Team app > More > Sync > Import file.

UPDATING HOME BASE
- The Dashboard checks for a newer Home Base each time you open it. When one is available,
  click "Update now". It backs up the database (backups\volleyball-before-vX.Y-....db) and the
  current program (backups\home_base-vX.Y.py), installs the new version and restarts itself.
- If it ever can't restart by itself, close the black window and double-click start-home-base.bat.
- Only the program comes from the web site. Your data never leaves this PC.

ADD A COACH
- The "Add a coach" tab shows a QR code that opens the Team app on a new coach's phone, the
  install steps (print it as a handout), and the setup file to send them by email or text.
- The setup file has players' names and ages: never post it anywhere public, including GitHub.

CLUB LOGO
- Dashboard > Club logo: choose a PNG or JPG and click "Use this logo". It goes to the phones
  in the next setup file and shows in the Team app's header.
- "Download app icon" makes icon.png (iPhone) plus icon-192.png and icon-512.png (Android): upload all three into the team folder
  on GitHub, then re-add the app to each Home Screen.

FILES IN THIS FOLDER
  home_base.py          the program
  start-home-base.bat   starts it
  volleyball.db         the master SQLite database (created on first start)
  inbox\                drop sync files here to import them
  imports\              a copy of every file that was imported
  backups\              one copy of the database per day, plus copies made before each update
  publish\              your tools for publishing new versions to the web site (see PUBLISH-README.txt)

OPENING THE DATABASE YOURSELF
volleyball.db is a normal SQLite file. Open it with "DB Browser for SQLite" (free) or any SQLite
tool. Ready-made views: v_schedule, v_match_results, v_serves, v_receives, v_attacks, v_blocks,
v_assists, v_points, v_player_season, v_playing_time, v_side_outs, v_work_matrix, v_links. Close Home Base before editing the file by hand.

TROUBLESHOOTING
- "python is not recognized": reinstall Python with "Add python.exe to PATH" ticked.
- "Port 8770 is already in use": Home Base is already running (maybe an old window). Close every
  Home Base window, or end python.exe in Task Manager, then start it again.
- An import says "This isn't a Team app sync file": export again from the Team app's Sync page.
