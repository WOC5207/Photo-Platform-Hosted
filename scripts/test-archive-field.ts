import assert from "node:assert/strict";
import type { ArchiveColumn, ArchiveFile } from "../src/components/album3d/types";
import { fairField, joinSlice, sliceAlbums, type Archive } from "../src/lib/archiveField";

// Candidates in directory order: photographers by sign-up, albums newest first.
const early = Array.from({ length: 200 }, (_, i) => ({ id: `a${i}`, ownerId: "alice", slug: `a-${i}` }));
const middle = Array.from({ length: 3 }, (_, i) => ({ id: `b${i}`, ownerId: "bob", slug: `b-${i}` }));
const late = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, ownerId: "carol", slug: `c-${i}` }));
const candidates = [...early, ...middle, ...late];

// A prolific early photographer no longer pushes everyone after them out.
{
  const field = fairField(candidates, 160);
  assert.equal(field.length, 160);
  for (const id of [...middle, ...late].map((c) => c.id)) assert.ok(field.includes(id), `${id} is in the field`);
  assert.equal(field.filter((id) => id.startsWith("a")).length, 152);
  // Each photographer keeps their newest albums.
  assert.deepEqual(
    field.filter((id) => id.startsWith("a")),
    early.slice(0, 152).map((c) => c.id)
  );
}

// Rounds go out in directory order: everyone's newest, then everyone's second.
{
  assert.deepEqual(fairField(candidates, 4), ["a0", "b0", "c0", "a1"]);
  assert.deepEqual(fairField(candidates, 0), []);
  assert.deepEqual(fairField([], 10), []);
}

// When everything fits, nothing is left out.
{
  const few = [...middle, ...late];
  assert.deepEqual(new Set(fairField(few, 160)), new Set(few.map((c) => c.id)));
}

// An address past the field brings in that photographer's newest albums, plus the one asked for.
{
  assert.deepEqual(sliceAlbums(early, 3), ["a0", "a1", "a2"]);
  assert.deepEqual(sliceAlbums(early, 3, "a-1"), ["a0", "a1", "a2"]);
  assert.deepEqual(sliceAlbums(early, 3, "a-180"), ["a0", "a1", "a2", "a180"]);
  assert.equal(sliceAlbums(early, 3, "not-theirs"), null);
  assert.equal(sliceAlbums(early, 3, "b-0"), null);
}

function file(id: string, column: number, number: number): ArchiveFile {
  return { id, slug: id, number, column, title: id, altTitle: "", location: "", dateLabel: "", photoCount: 1, href: `/3d/${id}`, prints: [] };
}
function column(username: string, fileIndexes: number[], albumCount = fileIndexes.length): ArchiveColumn {
  return { username, name: username, bookingEnabled: true, albumCount, photoCount: albumCount, fileIndexes };
}

const field: Archive = {
  files: [file("a0", 0, 1), file("a1", 0, 2), file("b0", 1, 3)],
  columns: [column("alice", [0, 1], 200), column("bob", [2])]
};

// A photographer the field held only in part gets their older albums after the ones it had.
{
  const slice: Archive = { files: [file("a0", 0, 1), file("a1", 0, 2), file("a2", 0, 3), file("a180", 0, 4)], columns: [column("alice", [0, 1, 2, 3], 200)] };
  const joined = joinSlice(field, slice);
  assert.ok(joined);
  assert.deepEqual(
    joined.files.map((f) => [f.id, f.column, f.number]),
    [
      ["a0", 0, 1],
      ["a1", 0, 2],
      ["b0", 1, 3],
      ["a2", 0, 4],
      ["a180", 0, 5]
    ]
  );
  assert.deepEqual(joined.columns[0].fileIndexes, [0, 1, 3, 4]);
  assert.deepEqual(joined.columns[1].fileIndexes, [2]);
  assert.equal(joined.columns[0].albumCount, 200);
  // The field it grew from is left as it was.
  assert.deepEqual(field.columns[0].fileIndexes, [0, 1]);
  assert.equal(field.files.length, 3);
}

// A photographer the field didn't hold at all becomes the last column.
{
  const slice: Archive = { files: [file("d0", 0, 1), file("d1", 0, 2)], columns: [column("dan", [0, 1])] };
  const joined = joinSlice(field, slice);
  assert.ok(joined);
  assert.deepEqual(
    joined.columns.map((c) => [c.username, c.fileIndexes]),
    [
      ["alice", [0, 1]],
      ["bob", [2]],
      ["dan", [3, 4]]
    ]
  );
  assert.deepEqual(
    joined.files.slice(3).map((f) => [f.id, f.column]),
    [
      ["d0", 2],
      ["d1", 2]
    ]
  );
}

// A slice that adds nothing leaves the scene alone.
{
  const slice: Archive = { files: [file("b0", 0, 1)], columns: [column("bob", [0])] };
  assert.equal(joinSlice(field, slice), null);
  assert.equal(joinSlice(field, { files: [], columns: [] }), null);
}

console.log("archive field tests passed");
