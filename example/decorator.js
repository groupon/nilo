import { Inject, Provides, createGraph } from '../';

@Inject()
class Electricity {
  constructor(e) { this.watt = 150; }
}

@Inject(Electricity)
class CoffeeMaker {
  constructor(e) { this.e = e; }
}

class Tile {
  constructor(color) { this.color = color; }
}

@Inject(CoffeeMaker, 'tiles')
class Kitchen {
  constructor(cm, tiles) { this.coffeeMaker = cm; this.tiles = tiles; }
}

const scope = createGraph({
  @Provides('tiles')
  getTiles() {
    return [ new Tile('green'), new Tile('pink'), new Tile('blue') ];
  }
}).createScope();
const kitchen = scope.construct(Kitchen);
console.log(kitchen);
