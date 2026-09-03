/**
 * Uygulamayla birlikte gelen "Ornek Model" dosyasini uretir.
 * Cikti: assets/sample/ornek-model.ifc  (IFC4, gecerli mekansal hiyerarsi + Pset)
 *
 * Kullanim: node scripts/make-sample-ifc.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets', 'sample');

let id = 0;
const lines = [];
/** Yeni bir IFC satiri ekler, #id dondurur. */
function E(body) {
  id += 1;
  lines.push(`#${id}=${body};`);
  return `#${id}`;
}

const GUID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
let guidSeed = 0x9E3779B9;
function guid() {
  let s = '';
  for (let i = 0; i < 22; i += 1) {
    // mulberry32: Math.imul ile 32-bit tasma guvenli
    guidSeed = (guidSeed + 0x6D2B79F5) | 0;
    let t = Math.imul(guidSeed ^ (guidSeed >>> 15), 1 | guidSeed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    s += GUID_CHARS[((t ^ (t >>> 14)) >>> 0) % 64];
  }
  return `'${s}'`;
}

const F = (n) => (Number.isInteger(n) ? `${n}.` : String(n));
const P3 = (x, y, z) => E(`IFCCARTESIANPOINT((${F(x)},${F(y)},${F(z)}))`);
const P2 = (x, y) => E(`IFCCARTESIANPOINT((${F(x)},${F(y)}))`);

/* ---------- Baglam ---------- */
const person = E(`IFCPERSON($,'Alkan','Eray',$,$,$,$,$)`);
const org = E(`IFCORGANIZATION($,'SiteOfSight',$,$,$)`);
const personOrg = E(`IFCPERSONANDORGANIZATION(${person},${org},$)`);
const app = E(`IFCAPPLICATION(${org},'1.0','SiteOfSight','SOS')`);
const owner = E(`IFCOWNERHISTORY(${personOrg},${app},$,.ADDED.,$,$,$,0)`);

const origin = P3(0, 0, 0);
const dirZ = E(`IFCDIRECTION((0.,0.,1.))`);
const dirX = E(`IFCDIRECTION((1.,0.,0.))`);
const axisRoot = E(`IFCAXIS2PLACEMENT3D(${origin},${dirZ},${dirX})`);
const context = E(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${axisRoot},$)`);

const unitLen = E(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`);
const unitArea = E(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`);
const unitVol = E(`IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)`);
const units = E(`IFCUNITASSIGNMENT((${unitLen},${unitArea},${unitVol}))`);

const project = E(`IFCPROJECT(${guid()},${owner},'Ornek Proje',$,$,$,$,(${context}),${units})`);

const sitePlacement = E(`IFCLOCALPLACEMENT($,${axisRoot})`);
const site = E(`IFCSITE(${guid()},${owner},'Saha 001',$,$,${sitePlacement},$,$,.ELEMENT.,$,$,$,$,$)`);

const buildingPlacement = E(`IFCLOCALPLACEMENT(${sitePlacement},${axisRoot})`);
const building = E(`IFCBUILDING(${guid()},${owner},'Ornek Bina',$,$,${buildingPlacement},$,$,.ELEMENT.,$,$,$)`);

const storeyPlacement = E(`IFCLOCALPLACEMENT(${buildingPlacement},${axisRoot})`);
const storey = E(`IFCBUILDINGSTOREY(${guid()},${owner},'Zemin Kat',$,$,${storeyPlacement},$,$,.ELEMENT.,0.)`);

E(`IFCRELAGGREGATES(${guid()},${owner},$,$,${project},(${site}))`);
E(`IFCRELAGGREGATES(${guid()},${owner},$,$,${site},(${building}))`);
E(`IFCRELAGGREGATES(${guid()},${owner},$,$,${building},(${storey}))`);

/* ---------- Yardimci: dikdortgen profil + ekstruzyon ---------- */
function boxProduct(entity, name, cx, cy, cz, xdim, ydim, height, extra = '$') {
  const loc = P3(cx, cy, cz);
  const axis = E(`IFCAXIS2PLACEMENT3D(${loc},${dirZ},${dirX})`);
  const placement = E(`IFCLOCALPLACEMENT(${storeyPlacement},${axis})`);

  const profileOrigin = P2(0, 0);
  const profilePos = E(`IFCAXIS2PLACEMENT2D(${profileOrigin},$)`);
  const profile = E(`IFCRECTANGLEPROFILEDEF(.AREA.,'${name}',${profilePos},${F(xdim)},${F(ydim)})`);

  const solidOrigin = P3(0, 0, 0);
  const solidAxis = E(`IFCAXIS2PLACEMENT3D(${solidOrigin},${dirZ},${dirX})`);
  const solid = E(`IFCEXTRUDEDAREASOLID(${profile},${solidAxis},${dirZ},${F(height)})`);

  const shape = E(`IFCSHAPEREPRESENTATION(${context},'Body','SweptSolid',(${solid}))`);
  const prodShape = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${shape}))`);

  return E(`${entity}(${guid()},${owner},'${name}',$,$,${placement},${prodShape},$,${extra})`);
}

const products = [];
const W = 8, D = 6, H = 3, T = 0.2;

products.push(boxProduct('IFCWALL', 'Duvar Guney', W / 2, T / 2, 0, W, T, H, '.SOLIDWALL.'));
products.push(boxProduct('IFCWALL', 'Duvar Kuzey', W / 2, D - T / 2, 0, W, T, H, '.SOLIDWALL.'));
products.push(boxProduct('IFCWALL', 'Duvar Bati', T / 2, D / 2, 0, T, D, H, '.SOLIDWALL.'));
products.push(boxProduct('IFCWALL', 'Duvar Dogu', W - T / 2, D / 2, 0, T, D, H, '.SOLIDWALL.'));
const slab = boxProduct('IFCSLAB', 'Zemin Doseme', W / 2, D / 2, -0.25, W, D, 0.25, '.FLOOR.');
products.push(slab);
products.push(boxProduct('IFCSLAB', 'Cati Dosemesi', W / 2, D / 2, H, W, D, 0.25, '.ROOF.'));
products.push(boxProduct('IFCCOLUMN', 'Kolon S1', W / 2, D / 2, 0, 0.4, 0.4, H, '$'));
products.push(boxProduct('IFCBEAM', 'Kiris K1', W / 2, D / 2, H - 0.3, W - 2 * T, 0.3, 0.3, '$'));

E(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid()},${owner},$,$,(${products.join(',')}),${storey})`);

/* ---------- Ornek Property Set (bilgi paneli icin) ---------- */
const p1 = E(`IFCPROPERTYSINGLEVALUE('Reference',$,IFCLABEL('DUV-001'),$)`);
const p2 = E(`IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T.),$)`);
const p3 = E(`IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCBOOLEAN(.T.),$)`);
const p4 = E(`IFCPROPERTYSINGLEVALUE('ThermalTransmittance',$,IFCREAL(0.24),$)`);
const pset = E(`IFCPROPERTYSET(${guid()},${owner},'Pset_WallCommon',$,(${p1},${p2},${p3},${p4}))`);
E(`IFCRELDEFINESBYPROPERTIES(${guid()},${owner},$,$,(${products.slice(0, 4).join(',')}),${pset})`);

const q1 = E(`IFCQUANTITYLENGTH('Length',$,$,${F(W)},$)`);
const q2 = E(`IFCQUANTITYAREA('NetSideArea',$,$,${F(W * H)},$)`);
const q3 = E(`IFCQUANTITYVOLUME('NetVolume',$,$,${F(W * H * T)},$)`);
const qset = E(`IFCELEMENTQUANTITY(${guid()},${owner},'Qto_WallBaseQuantities',$,$,(${q1},${q2},${q3}))`);
E(`IFCRELDEFINESBYPROPERTIES(${guid()},${owner},$,$,(${products[0]}),${qset})`);

const material = E(`IFCMATERIAL('Betonarme C30/37',$,$)`);
E(`IFCRELASSOCIATESMATERIAL(${guid()},${owner},$,$,(${products.join(',')}),${material})`);

/* ---------- Dosyayi yaz ---------- */
const header = [
  'ISO-10303-21;',
  'HEADER;',
  "FILE_DESCRIPTION((''),'2;1');",
  "FILE_NAME('ornek-model.ifc','2026-01-01T00:00:00',('SiteOfSight'),('SiteOfSight'),'SiteOfSight','SiteOfSight','');",
  "FILE_SCHEMA(('IFC4'));",
  'ENDSEC;',
  'DATA;',
].join('\n');

const content = `${header}\n${lines.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;

await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, 'ornek-model.ifc'), content, 'utf8');
console.log(`Ornek model yazildi: assets/sample/ornek-model.ifc (${lines.length} satir, ${products.length} eleman)`);
