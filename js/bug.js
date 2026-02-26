const RENDER_MODES = {
	NUMBER: 0,
	RECT: 1,
	NUMBER_AND_RECT: 2
}

// could bundle these into a 'CONFIG' that you should pass into a grid...to lazy for now.
const MAX_BUG_SPEED = 1;
const MIN_BUG_SPEED = 2;
const MAX_TRAIL_STRENGTH = 100;
const MIN_TRAIL_STRENGTH = 10;
const AUTO_ADD_BUG = false;
const BUG_COLOUR = "#B2B926";

var TICK = 0;
const TICK_RATE = 100;
setInterval(() => {
	TICK++;
}, 1000/TICK_RATE);


class Grid {
	#width;
	#height;
	#cells;
	#bugs;
	#canvas;
	#ctx;
	#cellWidth;
	#renderIntervalID;
	#decrementIntervalID;
	#decrementRate;
	#renderMode;

	constructor(renderMode, canvas) {
		this.#cellWidth = 16;
		this.#decrementRate = 2;
		this.#canvas = canvas;

		// high DPI support - https://web.dev/articles/canvas-hidipi
		var dpr = Math.max(1, Math.round(window.devicePixelRatio)); // we round here because floating point scale does not play nice in this scenario
		var initialWidth = this.#canvas.width;
		var initialHeight = this.#canvas.height;
		this.#canvas.width = initialWidth * dpr;
		this.#canvas.height = initialHeight * dpr;
		this.#canvas.style.width = initialWidth + "px";
		this.#canvas.style.height = initialHeight + "px";
		this.#ctx = this.#canvas.getContext("2d");
		this.#ctx.scale(dpr, dpr);

		this.#width = parseInt(this.#canvas.style.width) / this.#cellWidth;
		this.#height = parseInt(this.#canvas.style.height) / this.#cellWidth;

		this.#bugs = [];
		this.#cells = [];
		for (var x = 0; x <= this.#width; x++) {
			this.#cells[x] = [];
			for (var y = 0; y <= this.#height; y++) {
				this.#cells[x][y] = 0; // had an idea here to make it a grid of numbers that we can just decrement from each tick. This way we might have a bit of an easier time dealing with fades. (we could even optionally render these numbers for the visualisation).
			}
		}
		if (Object.values(RENDER_MODES).some(n => renderMode == n)){
			this.#renderMode = renderMode;
		} else {
			throw new Error("Invalid render mode");
		}
	}

	get width() {
		return this.#width;
	}

	get height() {
		return this.#height;
	}

	incrementCell(x, y, step=1) {
		if (this.#cells[x][y] < step) {
			this.#cells[x][y] = step; // this isn't "incrementing" at all now, but makes sure strong trails win and reduces cut-offs
		}
	}

	decrementCell(x, y, step=1) {
		this.#cells[x][y]--;
	}

	addBug(x, y) {
		this.#bugs.push(new Bug(x, y, this));
	}

	gridToScreenCoords(x, y) {
		return { x: (x*this.#cellWidth), y: (y*this.#cellWidth) }
	}

	clearCell(x, y) {
		const cellCoords = this.gridToScreenCoords(x, y);
		this.#ctx.clearRect(cellCoords.x, cellCoords.y, this.#cellWidth, this.#cellWidth);
	}

	drawCellNumber(x, y) {
		const cellCoords = this.gridToScreenCoords(x, y);
		this.#ctx.font = "10px serif";
		this.#ctx.fillStyle = "#ffffff";
		this.#ctx.fillText(this.#cells[x][y].toString()[0], cellCoords.x + 5, cellCoords.y - 5 + this.#cellWidth); // when drawing text we have to push the text down because our x,y defines the bottom left corner of the text.
	}

	drawHighlightedCell(x, y) {
		const cellCoords = this.gridToScreenCoords(x, y);
		const cellValue = this.#cells[x][y];
		this.#ctx.globalAlpha = (1/MAX_TRAIL_STRENGTH) * cellValue;
		this.#ctx.fillStyle = BUG_COLOUR;
		this.#ctx.fillRect(cellCoords.x, cellCoords.y, this.#cellWidth, this.#cellWidth);
		this.#ctx.globalAlpha = 1;
	}

	start() {
		//Render and Bug Update
		this.#renderIntervalID = setInterval(() => {
			//Handle bug updates
			for (var bugIndex = 0; bugIndex < this.#bugs.length; bugIndex++) {
				const bug = this.#bugs[bugIndex];
				if (bug.x > this.#width || bug.x < 0 || bug.y > this.#height || bug.y < 0) { 
					this.#bugs.splice(bugIndex, 1);
					if (AUTO_ADD_BUG) {
						this.addBug(
							Math.round(Math.random()) * Math.floor(this.#width), 
							Math.round(Math.random() * Math.floor(this.#height))
						);
					}
					return;
				}
				bug.update();
			}

			// Draw any cells that aren't 0
			for (var x = 0; x <= this.#width; x++) {
				for (var y = 0; y <= this.#height; y++) {
					if (this.#cells[x][y] != 0) {
						switch (this.#renderMode) {
							case RENDER_MODES.NUMBER:
								this.clearCell(x, y); // clear number currently on the cells
								this.drawCellNumber(x, y);
								break;
							case RENDER_MODES.RECT:
								this.clearCell(x, y);
								this.drawHighlightedCell(x, y);
								break;
							case RENDER_MODES.NUMBER_AND_RECT:
								this.clearCell(x, y);
								this.drawHighlightedCell(x, y);
								this.drawCellNumber(x, y);
								break;
						}
					}
				}
			}
		}, 1000/TICK_RATE);

		this.#decrementIntervalID = setInterval(() => {
			for (var x = 0; x <= this.#width; x++) {
				for (var y = 0; y <= this.#height; y++) {
					if (this.#cells[x][y] != 0) {
						this.decrementCell(x, y);
						if (this.#cells[x][y] == 0) {
							this.clearCell(x, y);
						}
					}
				}
			}
		}, (1000/TICK_RATE)*this.#decrementRate);
	}

	reset() {
		clearInterval(this.#renderIntervalID);
		clearInterval(this.#decrementIntervalID);
		this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
		
		// high DPI support - https://web.dev/articles/canvas-hidipi
		var dpr = Math.max(1, Math.round(window.devicePixelRatio));
		var initialWidth = this.#canvas.width;
		var initialHeight = this.#canvas.height;
		this.#canvas.width = initialWidth * dpr;
		this.#canvas.height = initialHeight * dpr;
		this.#canvas.style.width = initialWidth + "px";
		this.#canvas.style.height = initialHeight + "px";
		this.#ctx = this.#canvas.getContext("2d");
		this.#ctx.scale(dpr, dpr);

		this.#width = parseInt(this.#canvas.style.width) / this.#cellWidth;
		this.#height = parseInt(this.#canvas.style.height) / this.#cellWidth;

		this.#bugs = [];
		this.#cells = [];
		for (var x = 0; x <= this.#width; x++) {
			this.#cells[x] = [];
			for (var y = 0; y <= this.#height; y++) {
				this.#cells[x][y] = 0; 
			}
		}
		this.start();
	}
}

class Bug {
	#x;
	#y;
	#speed;
	#grid;
	#preferRight;
	#lastRenderedTick;
	#trailStrength;
	
	constructor(x, y, grid) {
		this.#x = x;
		this.#y = y;
		this.#grid = grid;
		this.#preferRight = this.#x < (this.#grid.width/2)
		this.#speed = Math.max(MAX_BUG_SPEED, Math.round(Math.random() * MIN_BUG_SPEED));
		this.#lastRenderedTick = 0;
		this.#trailStrength = Math.max(MIN_TRAIL_STRENGTH, Math.floor(Math.random() * MAX_TRAIL_STRENGTH));
	}

	update() {
		if ((TICK % this.#speed == 0) && (this.#lastRenderedTick != TICK)) {
			this.#grid.incrementCell(this.#x, this.#y, this.#trailStrength);
			
			var dir = Math.floor(Math.random() * 100);
			if (dir <= 80) {
				if (this.#preferRight) { 
					this.#x++; 
				} else {
					this.#x--;
				}
			} else if (dir <= 90) {
				this.#y++;
			} else {
				this.#y--;
			}
			
			this.#lastRenderedTick = TICK;
		}
	}

	get x() {
		return this.#x;
	}

	get y() {
		return this.#y;
	}
}


function main() {
	const canvas = document.getElementById("background");
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	var grid = new Grid(RENDER_MODES.NUMBER_AND_RECT, canvas);
	var addBugsID = setInterval(() => {
		if (!document.hidden) { // The canvas doesn't update while the tab is backgrounded, so we need to stop adding bugs.
			grid.addBug(
				Math.round(Math.random()) * Math.floor(grid.width), 
				Math.round(Math.random() * Math.floor(grid.height))
			);
		}
	}, 3000);
	grid.start();

	window.addEventListener("resize", () => {
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		grid.reset();
	});
}

main();
