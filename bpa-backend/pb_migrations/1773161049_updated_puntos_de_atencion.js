/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1957727135")

  // update field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "select4271437280",
    "maxSelect": 1,
    "name": "municipio",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "contramaestre",
      "san-luis",
      "segundo-frente",
      "songo-la-maya",
      "santiago-de-cuba",
      "palma-soriano",
      "guama",
      "tercer-frente",
      "mella"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1957727135")

  // update field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "select4271437280",
    "maxSelect": 1,
    "name": "municipio",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "contramaestre",
      "san-luis",
      "segundo-frente",
      "songo-la-maya",
      "santiago-de-cuba",
      "palma-soriano",
      "el-cobre",
      "el-caney",
      "guama"
    ]
  }))

  return app.save(collection)
})
