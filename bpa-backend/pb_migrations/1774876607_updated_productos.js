/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_308246142")

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text2394190165",
    "max": 0,
    "min": 0,
    "name": "nombre_en",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(6, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text3817247289",
    "max": 0,
    "min": 0,
    "name": "descripcion_en",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(8, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text867891054",
    "max": 0,
    "min": 0,
    "name": "contenido_en",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_308246142")

  // remove field
  collection.fields.removeById("text2394190165")

  // remove field
  collection.fields.removeById("text3817247289")

  // remove field
  collection.fields.removeById("text867891054")

  return app.save(collection)
})
