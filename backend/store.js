import { MongoClient } from 'mongodb'

let database

export async function connectToDatabase() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/'
  const databaseName = process.env.MONGODB_DB_NAME || 'daymark'
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 })
  await client.connect()
  database = client.db(databaseName)
  await Promise.all([
    database.collection('users').createIndex({ id: 1 }, { unique: true }),
    database.collection('users').createIndex({ email: 1 }, { unique: true }),
    database.collection('sections').createIndex({ id: 1 }, { unique: true }),
    database.collection('sections').createIndex({ userId: 1 }),
    database.collection('todos').createIndex({ id: 1 }, { unique: true }),
    database.collection('todos').createIndex({ sectionId: 1 }),
  ])
  console.log(`Connected to MongoDB database "${databaseName}".`)
}

function collection(name) {
  if (!database) throw new Error('MongoDB has not been connected.')
  return database.collection(name)
}

export async function findUserByEmail(email) {
  return collection('users').findOne({ email }, { projection: { _id: 0 } })
}

export async function findUserById(id) {
  return collection('users').findOne({ id }, { projection: { _id: 0 } })
}

export async function createUser(user) {
  await collection('users').insertOne(user)
  return user
}

export async function listWorkspace(userId) {
  const sections = await collection('sections')
    .find({ userId })
    .project({ _id: 0 })
    .sort({ createdAt: 1 })
    .toArray()

  if (sections.length === 0) return { sections, todos: [] }

  const sectionNames = new Map(sections.map((section) => [section.id, section.name]))
  const todos = await collection('todos')
    .find({ sectionId: { $in: sections.map((section) => section.id) } })
    .project({ _id: 0 })
    .sort({ createdAt: -1 })
    .toArray()

  return {
    sections,
    todos: todos.map((todo) => ({ ...todo, sectionName: sectionNames.get(todo.sectionId) })),
  }
}

export async function createSection(section) {
  await collection('sections').insertOne(section)
  return section
}

export async function findOwnedSection(sectionId, userId) {
  return collection('sections').findOne({ id: sectionId, userId }, { projection: { _id: 0 } })
}

export async function createTodo(todo) {
  await collection('todos').insertOne(todo)
  return todo
}

export async function updateOwnedTodoStatus(todoId, userId, status) {
  const todo = await collection('todos').findOne({ id: todoId }, { projection: { _id: 0 } })
  if (!todo) return null
  const section = await findOwnedSection(todo.sectionId, userId)
  if (!section) return null

  const updatedAt = new Date().toISOString()
  await collection('todos').updateOne(
    { id: todoId },
    { $set: { status, updatedAt } },
  )
  return { ...todo, status, updatedAt, sectionName: section.name }
}

export async function deleteOwnedTodo(todoId, userId) {
  const todo = await collection('todos').findOne({ id: todoId }, { projection: { _id: 0 } })
  if (!todo) return false
  const section = await findOwnedSection(todo.sectionId, userId)
  if (!section) return false

  const result = await collection('todos').deleteOne({ id: todoId })
  return result.deletedCount === 1
}
