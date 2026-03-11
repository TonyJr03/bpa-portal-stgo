/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4251364287")

  // update field
  collection.fields.addAt(2, new Field({
    "hidden": false,
    "id": "select1152408621",
    "maxSelect": 10,
    "name": "billetes",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "1",
      "3",
      "5",
      "10",
      "20",
      "50",
      "100",
      "200",
      "500",
      "1000"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4251364287")

  // update field
  collection.fields.addAt(2, new Field({
    "hidden": false,
    "id": "select1152408621",
    "maxSelect": 2,
    "name": "billetes",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "1",
      "3",
      "5",
      "10",
      "20",
      "50",
      "100",
      "200",
      "500",
      "1000"
    ]
  }))

  return app.save(collection)
})
