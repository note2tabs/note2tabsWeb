type Point = { x: number; y: number };
type Bounds = { left: number; right: number; top: number; bottom: number };

export function insideMenuBounds(point: Point, bounds: Bounds) {
  return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
}

/** A small margin at the origin and a triangle toward the nearest menu edge. */
export function insideMenuCorridor(point: Point, origin: Point, bounds: Bounds) {
  const margin = 8;
  if (Math.abs(point.x - origin.x) <= margin && Math.abs(point.y - origin.y) <= margin) return true;
  let a: Point, b: Point;
  if (origin.y <= bounds.top) {
    a = { x: bounds.left - margin, y: bounds.top + margin }; b = { x: bounds.right + margin, y: bounds.top + margin };
  } else if (origin.y >= bounds.bottom) {
    a = { x: bounds.left - margin, y: bounds.bottom - margin }; b = { x: bounds.right + margin, y: bounds.bottom - margin };
  } else {
    const x = origin.x < bounds.left ? bounds.left + margin : bounds.right - margin;
    a = { x, y: bounds.top - margin }; b = { x, y: bounds.bottom + margin };
  }
  const cross = (p: Point, q: Point, r: Point) => (p.x - r.x) * (q.y - r.y) - (q.x - r.x) * (p.y - r.y);
  const signs = [cross(point, origin, a), cross(point, a, b), cross(point, b, origin)];
  return !(signs.some((value) => value < 0) && signs.some((value) => value > 0));
}
