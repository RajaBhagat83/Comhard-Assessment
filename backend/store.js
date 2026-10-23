import { MongoClient } from 'mongodb'

let database
const statusDurationKeys = {
  pending: 'pending',
  'in review': 'inReview',
  done: 'done',
}
const emptyDurations = { pending: 0, inReview: 0, done: 0 }

function normalizeTodo(todo) {
  return {
    ...todo,
    enteredCurrentStatusAt: todo.enteredCurrentStatusAt || todo.updatedAt || todo.createdAt || new Date().toISOString(),
    durations: { ...emptyDurations, ...todo.durations },
  }
}

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
    todos: todos.map((todo) => ({
      ...normalizeTodo(todo),
      sectionName: sectionNames.get(todo.sectionId),
    })),
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
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const storedTodo = await collection('todos').findOne({ id: todoId }, { projection: { _id: 0 } })
    if (!storedTodo) return null
    const section = await findOwnedSection(storedTodo.sectionId, userId)
    if (!section) return null

    const todo = normalizeTodo(storedTodo)
    if (todo.status === status) return { ...todo, sectionName: section.name }

    const now = new Date()
    const updatedAt = now.toISOString()
    const elapsedSeconds = Math.max(0, (now.getTime() - Date.parse(todo.enteredCurrentStatusAt)) / 1000)
    const previousDurationKey = statusDurationKeys[todo.status]
    const durations = { ...todo.durations }
    if (previousDurationKey) durations[previousDurationKey] += elapsedSeconds

    const match = { id: todoId, status: todo.status }
    if (storedTodo.enteredCurrentStatusAt === undefined) {
      match.enteredCurrentStatusAt = { $exists: false }
    } else {
      match.enteredCurrentStatusAt = storedTodo.enteredCurrentStatusAt
    }

    const result = await collection('todos').updateOne(match, {
      $set: { status, enteredCurrentStatusAt: updatedAt, durations, updatedAt },
    })
    if (result.matchedCount === 1) {
      return {
        ...todo,
        status,
        enteredCurrentStatusAt: updatedAt,
        durations,
        updatedAt,
        sectionName: section.name,
      }
    }
  }

  throw new Error(`Could not update status for task "${todoId}" after concurrent changes.`)
}

export async function deleteOwnedTodo(todoId, userId) {
  const todo = await collection('todos').findOne({ id: todoId }, { projection: { _id: 0 } })
  if (!todo) return false
  const section = await findOwnedSection(todo.sectionId, userId)
  if (!section) return false

  const result = await collection('todos').deleteOne({ id: todoId })
  return result.deletedCount === 1
}
