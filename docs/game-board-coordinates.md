# Game boards and voice coordinates

Grid labels are on by default; set data.showLabels=false to hide them. Letters identify columns. Chess, checkers, Go and reversi number rows from the bottom; other grids (including Sudoku) number from the top. Chess/checkers letters sit below the board. Backgammon keeps its point numbers and Bar/Off labels.

Both visible coordinates (F3, C7) and existing rROWcCOLUMN keys are accepted in cells, piece.cell and annotation.cells. They normalize to internal keys, where r1c1 is always top-left. Do not submit two aliases for the same cell. Patch paths use the normalized keys returned by display.current.

Poker places community/board zones in the center and seats around an oval. Use zone.role to explicitly identify roles, zone.bet for a seat bet, or counter.zone to attach a counter to its seat; unassigned counters (such as pot) sit inside the table. Blackjack dealer zones remain above player hands. Solitaire uses stock/waste, four foundations, and seven tableau columns with overlapping cards in all orientations. These are displays, not game engines: the agent owns rules and state transitions.
