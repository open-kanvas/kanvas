// Curated public CC0 game props. Full provenance: public/scene-assets/manifest.json
export const SCENE_ASSETS = [
  {
    "id": "kenney-sedan",
    "label": "Sedan",
    "file": "sedan.glb",
    "parts": [
      "wheel-front-right",
      "body",
      "wheel-back-left",
      "wheel-back-right",
      "wheel-front-left"
    ],
    "partBounds": {
      "wheel-front-right": {
        "center": [
          -0.28333337,
          -0.26923076,
          0.26862744
        ],
        "size": [
          0.2333334,
          0.46153848,
          0.23529413
        ]
      },
      "body": {
        "center": [
          0.0,
          0.05769231,
          0.0
        ],
        "size": [
          1.0,
          0.88461537,
          1.0
        ]
      },
      "wheel-back-left": {
        "center": [
          0.28333337,
          -0.26923076,
          -0.2490196
        ],
        "size": [
          0.2333334,
          0.46153848,
          0.23529413
        ]
      },
      "wheel-back-right": {
        "center": [
          -0.28333337,
          -0.26923076,
          -0.2490196
        ],
        "size": [
          0.2333334,
          0.46153848,
          0.23529413
        ]
      },
      "wheel-front-left": {
        "center": [
          0.28333337,
          -0.26923076,
          0.26862744
        ],
        "size": [
          0.2333334,
          0.46153848,
          0.23529413
        ]
      }
    },
    "bytes": 184600
  },
  {
    "id": "kenney-debris-drivetrain",
    "label": "Debris Drivetrain",
    "file": "debris-drivetrain.glb",
    "parts": [
      "debris-drivetrain"
    ],
    "partBounds": {
      "debris-drivetrain": {
        "center": [
          0.0,
          0.0,
          0.0
        ],
        "size": [
          1.0,
          1.0,
          1.0
        ]
      }
    },
    "bytes": 49320
  },
  {
    "id": "kenney-debris-drivetrain-axle",
    "label": "Debris Drivetrain Axle",
    "file": "debris-drivetrain-axle.glb",
    "parts": [
      "debris-drivetrain-axle"
    ],
    "partBounds": {
      "debris-drivetrain-axle": {
        "center": [
          0.0,
          0.0,
          0.0
        ],
        "size": [
          1.0,
          1.0,
          1.0
        ]
      }
    },
    "bytes": 31164
  },
  {
    "id": "kenney-debris-bolt",
    "label": "Debris Bolt",
    "file": "debris-bolt.glb",
    "parts": [
      "debris-bolt"
    ],
    "partBounds": {
      "debris-bolt": {
        "center": [
          0.0,
          0.0,
          0.0
        ],
        "size": [
          1.0,
          1.0,
          1.0
        ]
      }
    },
    "bytes": 17196
  },
  {
    "id": "kenney-wheel-default",
    "label": "Wheel Default",
    "file": "wheel-default.glb",
    "parts": [
      "wheel-default"
    ],
    "partBounds": {
      "wheel-default": {
        "center": [
          0.0,
          0.0,
          0.0
        ],
        "size": [
          1.0,
          1.0,
          1.0
        ]
      }
    },
    "bytes": 39248
  },
  {
    "id": "kenney-boat-sail-a",
    "label": "Boat Sail A",
    "file": "boat-sail-a.glb",
    "parts": [
      "boat-sail-a",
      "sail"
    ],
    "partBounds": {
      "boat-sail-a": {
        "center": [
          0.0,
          -0.32354392,
          0.0
        ],
        "size": [
          1.0,
          0.35291216,
          1.0
        ]
      },
      "sail": {
        "center": [
          -0.0,
          0.09205257,
          0.12500859
        ],
        "size": [
          0.21298408,
          0.81589485,
          0.70458277
        ]
      }
    },
    "bytes": 44144
  },
  {
    "id": "kenney-boat-fishing-small",
    "label": "Boat Fishing Small",
    "file": "boat-fishing-small.glb",
    "parts": [
      "boat-fishing-small"
    ],
    "partBounds": {
      "boat-fishing-small": {
        "center": [
          0.0,
          0.0,
          0.0
        ],
        "size": [
          1.0,
          1.0,
          1.0
        ]
      }
    },
    "bytes": 31820
  },
  {
    "id": "kenney-boat-fan",
    "label": "Boat Fan",
    "file": "boat-fan.glb",
    "parts": [
      "boat-fan",
      "fan"
    ],
    "partBounds": {
      "boat-fan": {
        "center": [
          0.0,
          0.0,
          0.0
        ],
        "size": [
          1.0,
          1.0,
          1.0
        ]
      },
      "fan": {
        "center": [
          0.0,
          0.0733261,
          -0.3954704
        ],
        "size": [
          0.54931919,
          0.42864718,
          0.12020906
        ]
      }
    },
    "bytes": 40036
  }
] as const;
export type SceneAssetId = typeof SCENE_ASSETS[number]["id"];
export const sceneAsset = (id:string)=>SCENE_ASSETS.find(asset=>asset.id===id);
