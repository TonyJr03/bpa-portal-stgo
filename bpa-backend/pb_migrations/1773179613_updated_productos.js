/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_308246142")

  // add field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "select1309676077",
    "maxSelect": 1,
    "name": "categoria",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "banca-personal",
      "banca-corporativa",
      "banca-electronica",
      "banca-internacional",
      "otros-servicios"
    ]
  }))

  // update field
  collection.fields.addAt(3, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_2687480828",
    "hidden": false,
    "id": "relation1309676077",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "categorias",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_308246142")

  // remove field
  collection.fields.removeById("select1309676077")

  // update field
  collection.fields.addAt(3, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_2687480828",
    "hidden": false,
    "id": "relation1309676077",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "categoria",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
})
