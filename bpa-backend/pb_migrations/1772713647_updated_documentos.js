/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3758627238")

  // update field
  collection.fields.addAt(2, new Field({
    "hidden": false,
    "id": "file891925634",
    "maxSelect": 1,
    "maxSize": 0,
    "mimeTypes": [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ],
    "name": "archivo",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": [],
    "type": "file"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3758627238")

  // update field
  collection.fields.addAt(2, new Field({
    "hidden": false,
    "id": "file891925634",
    "maxSelect": 1,
    "maxSize": 0,
    "mimeTypes": [],
    "name": "archivo",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": [],
    "type": "file"
  }))

  return app.save(collection)
})
