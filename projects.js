window.PORTFOLIO_PROJECTS = [
  {
    "id": "atnathanosu",
    "title": "atNathanOsu",
    "subtitle": "A home-built rhythm game with standard and four-key play",
    "category": "software",
    "stack": [
      "Java",
      "Swing",
      "AWT"
    ],
    "image": "assets/atnathanosu-menu.png",
    "accent": "#ee78a8",
    "summary": "A Java rhythm game inspired by osu!, with custom menus, song selection, standard circle play, and a four-key mode. The project includes a Bocchi the Rock! themed skin and a collection of playable maps.",
    "role": "Main menu, song select & standard mode",
    "focus": "Game systems & interaction",
    "facts": [
      {
        "label": "Language",
        "value": "Java"
      },
      {
        "label": "Modes",
        "value": "Standard and 4-key"
      },
      {
        "label": "Maps",
        "value": "7 included"
      }
    ],
    "images": [
      {
        "src": "assets/atnathanosu-menu.png",
        "alt": "atNathanOsu main menu with a Bocchi the Rock! themed circle button",
        "caption": "Custom main menu, animated circle button, and Bocchi-themed skin."
      },
      {
        "src": "assets/atnathanosu-select.png",
        "alt": "Song selection screen in atNathanOsu",
        "caption": "Browse the included songs and choose a map to play."
      },
      {
        "src": "assets/atnathanosu-standard.png",
        "alt": "Standard mode showing hit circles and approach rings with score, accuracy, and combo",
        "caption": "Standard play with timed hit circles, approach rings, and live scoring."
      },
      {
        "src": "assets/atnathanosu-keys.png",
        "alt": "Four-key mode gameplay in atNathanOsu",
        "caption": "Four-key mode with notes falling toward four input lanes."
      }
    ],
    "description": "atNathanOsu is a Java Swing rhythm game inspired by osu!. It has a custom main menu and song-selection flow, a standard mode built around timed circles, and a four-key mode. The game ships with seven maps, score tracking, and a Bocchi the Rock! themed skin.",
    "highlights": [
      "Built the main menu, song-selection menu, standard gameplay mode, and mouse-button and no-fail options.",
      "Implemented circle timing, approach-ring rendering, hit judgments, score, accuracy, combo, and saved top scores.",
      "Worked with Adrian Tang on an about/instructions menu and a map-conversion utility; Adrian built the four-key mode, fail menu, and results screen."
    ],
    "engineering": "The Java game reads its own note-data and map-info text files to time and render notes. Standard play draws circles and shrinking approach rings; the separate four-key mode scrolls notes through four lanes. A companion converter adapts map data into the text formats used by the game.",
    "contribution": "I built the main menu, song-selection menu, standard mode, and mouse-button and no-fail options. Adrian Tang built the four-key mode, fail menu, and results screen. We worked together on the about/instructions menu and map-conversion utility.",
    "repo": null,
    "collaboration": "Made with Adrian Tang, who built the four-key mode, fail menu, and results screen; we shared work on the instructions/about menu and map converter."
  },
  {
    "id": "market",
    "title": "Market Simulation Game",
    "subtitle": "A paper-trading game with a market of its own",
    "category": "software",
    "stack": [
      "Java",
      "Swing",
      "AWT"
    ],
    "image": "assets/trading.png",
    "accent": "#fa6b43",
    "summary": "A desktop stock-market game built around simulated price movement and trading decisions. Players can save several runs and return to them later.",
    "role": "Graphics & pricing algorithm",
    "focus": "Simulation systems",
    "facts": [
      {
        "label": "Format",
        "value": "Java desktop game"
      },
      {
        "label": "Assets",
        "value": "12 stocks and crypto"
      },
      {
        "label": "Team",
        "value": "2 people"
      }
    ],
    "images": [
      {
        "src": "assets/trading.png",
        "alt": "Pump and Dump trading screen with a stock chart and market controls",
        "caption": "The trading screen, stock graphics, and price movement system."
      },
      {
        "src": "assets/saves.png",
        "alt": "Saved game slots in Pump and Dump",
        "caption": "Multiple save slots let players continue a previous run."
      }
    ],
    "description": "Pump and Dump is a Java Swing/AWT market simulation game made with Jerry Li. Players trade a configurable set of stock and crypto assets, watch prices change, and can save and resume multiple game slots.",
    "highlights": [
      "Built a price model using pressure toward a rolling baseline, momentum, and probability weights.",
      "Created the graphic assets, stock graphics, trading screen, and in-game notifications.",
      "Added multiple save slots; each asset can retain more than 1,400 price candles for a resumed game."
    ],
    "engineering": "The pricing algorithm combines pressure toward a rolling baseline with momentum. Probability weights shape possible price changes, keeping the market simulation varied while retaining recognizable behavior.",
    "contribution": "I built the graphic assets, stock graphics, trading screen, notifications, multi-slot save system, and stock-pricing algorithm. Jerry built the stock-list interface and chatbot. We collaborated on the parameters, testing tool, and overall design.",
    "repo": "https://github.com/nathan21-29/pumpAndDumpGame",
    "collaboration": "Made with Jerry Li; UI and systems work were split between us, with design and tuning done together."
  },
  {
    "id": "f1",
    "title": "F1 Speed Map",
    "subtitle": "Qualifying laps, mapped in motion",
    "category": "software",
    "stack": [
      "Python",
      "FastF1",
      "NumPy",
      "pandas",
      "Matplotlib"
    ],
    "image": "assets/f1-map.png",
    "accent": "#e84452",
    "summary": "A Python tool that turns Formula 1 lap telemetry into an animated circuit speed map, making speed changes and braking zones easier to inspect.",
    "role": "Telemetry & visualization",
    "focus": "Data visualization",
    "facts": [
      {
        "label": "Data source",
        "value": "FastF1 telemetry"
      },
      {
        "label": "Lap selection",
        "value": "Up to 10 drivers"
      },
      {
        "label": "Output",
        "value": "Animated speed map"
      }
    ],
    "images": [
      {
        "src": "assets/f1-map.png",
        "alt": "Speed visualization for Max Verstappen’s 2021 Abu Dhabi lap",
        "caption": "A single-driver speed map from Verstappen's 2021 Abu Dhabi lap."
      },
      {
        "src": "assets/f1-terminal.png",
        "alt": "Terminal interface for choosing an F1 season and session",
        "caption": "Season and session selection in the terminal."
      }
    ],
    "description": "F1 Speed Map uses FastF1 telemetry and Python plotting tools to render an animated speed heatmap over a circuit. It can show braking zones and driver labels, with a terminal flow for selecting a season and session.",
    "highlights": [
      "Select up to 10 qualifying laps from the chosen top 10 drivers.",
      "For two selected drivers, interpolate lap times at equal track distances and display their delta to three decimal places.",
      "Cache session data locally to make repeat analysis more convenient."
    ],
    "engineering": "The comparison aligns two laps by distance along the track, interpolates each driver's time at matching positions, and plots the resulting difference. The displayed delta is rounded to three decimal places.",
    "contribution": "I built the data selection flow, telemetry processing, distance-based lap comparison, and animated visualization. The project combines FastF1 data with NumPy, pandas, and Matplotlib.",
    "repo": "https://github.com/nathan21-29/f1_speed_map",
    "collaboration": null
  },
  {
    "id": "crane",
    "title": "Arduino Crane",
    "subtitle": "Joystick control that remembers its last move",
    "category": "hardware",
    "stack": [
      "Arduino",
      "C++",
      "EEPROM",
      "Servos",
      "Analog joystick"
    ],
    "image": "assets/crane.png",
    "accent": "#50c3ad",
    "summary": "A small popsicle-stick crane controlled with an analog joystick. Its servo positions are saved so the mechanism can restore its pose after a restart.",
    "role": "Arduino code",
    "focus": "Embedded control",
    "facts": [
      {
        "label": "Controller",
        "value": "Arduino"
      },
      {
        "label": "Input",
        "value": "Analog joystick"
      },
      {
        "label": "Position memory",
        "value": "EEPROM"
      }
    ],
    "images": [
      {
        "src": "assets/crane.png",
        "alt": "Popsicle-stick crane with joystick and Arduino control components",
        "caption": "The assembled crane prototype."
      }
    ],
    "description": "This physical computing project pairs a lightweight popsicle-stick frame with joystick-controlled servo movement. The Arduino stores the servo positions in EEPROM and restores them at startup.",
    "highlights": [
      "Mapped analog joystick input to proportional movement on two axes.",
      "Saved servo positions to EEPROM and restored them after reboot to avoid a sudden startup jump.",
      "Built and tested the mechanism as a team, accounting for the servos’ limited torque."
    ],
    "engineering": "The joystick's analog readings control proportional movement along two axes. Servo positions are written to EEPROM and loaded at boot, which lets the crane return to its last saved pose instead of jumping to a default position. The servos' limited torque meant the frame stayed light and rigid.",
    "contribution": "I wrote all of the Arduino code and helped build the popsicle-stick frame. My partner handled most of the wiring, and we traced the connections together.",
    "repo": null,
    "collaboration": "Built with a partner who handled most of the wiring; we worked through the wiring connections together."
  }
];
