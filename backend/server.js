import 'dotenv/config'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import {
  connectToDatabase,
  createSection,
  createTodo,
  createUser,
  deleteOwnedTodo,
  findOwnedSection,
  findUserByEmail,
  findUserById,
  listWorkspace,
  updateOwnedTodoStatus,
} from './store.js'

const app = express()
const port = Number(process.env.PORT) || 4000
const jwtSecret = process.env.JWT_SECRET

if (process.env.NODE_ENV === 'production' && !jwtSecret) {
  throw new Error('JWT_SECRET must be configured before starting the server in production.')
}

const secret = jwtSecret || 'daymark-local-development-secret-change-before-deploying'
const validStatuses = new Set(['pending', 'in review', 'done'])

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }))
app.use(express.json({ limit: '20kb' }))

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email }
}

function createToken(user) {
  return jwt.sign({ sub: user.id }, secret, { expiresIn: '7d' })
}

function requireAuth(request, response, next) {
  const authorization = request.headers.authorization
  const [scheme, token] = authorization?.split(' ') || []
  if (scheme !== 'Bearer' || !token) {
    return response.status(401).json({ error: 'Sign in to access your workspace.' })
  }

  try {
    const payload = jwt.verify(token, secret)
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      return response.status(401).json({ error: 'Your session is invalid. Please sign in again.' })
    }
    request.userId = payload.sub
    return next()
  } catch {
    return response.status(401).json({ error: 'Your session has expired. Please sign in again.' })
  }
}

function validText(value, minLength, maxLength) {
  return typeof value === 'string' && value.trim().length >= minLength && value.trim().length <= maxLength
}

app.get('/api/health', (request, response) => response.json({ status: 'ok' }))

app.post('/api/auth/signup', asyncRoute(async (request, response) => {
  const name = typeof request.body.name === 'string' ? request.body.name.trim() : ''
  const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : ''
  const password = request.body.password
  if (!validText(name, 2, 80)) return response.status(400).json({ error: 'Name must be between 2 and 80 characters.' })
  if (!validText(email, 3, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: 'Enter a valid email address.' })
  }
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return response.status(400).json({ error: 'Password must be at least 8 characters and no more than 72 bytes.' })
  }

  const user = {
    id: randomUUID(),
    name,
    email,
    passwordHash: await bcrypt.hash(password, 12),
    createdAt: new Date().toISOString(),
  }
  try {
    await createUser(user)
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ error: 'An account with this email already exists.' })
    throw error
  }
  return response.status(201).json({ token: createToken(user), user: publicUser(user) })
}))

app.post('/api/auth/login', asyncRoute(async (request, response) => {
  const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : ''
  const password = request.body.password
  if (!validText(email, 3, 254) || typeof password !== 'string' || password.length === 0) {
    return response.status(400).json({ error: 'Enter your email and password.' })
  }
  const user = await findUserByEmail(email)
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return response.status(401).json({ error: 'Email or password is incorrect.' })
  }
  return response.json({ token: createToken(user), user: publicUser(user) })
}))

app.get('/api/workspace', requireAuth, asyncRoute(async (request, response) => {
  const user = await findUserById(request.userId)
  if (!user) return response.status(401).json({ error: 'Your account is no longer available. Please sign in again.' })
  const workspace = await listWorkspace(user.id)
  return response.json({ user: publicUser(user), ...workspace })
}))

app.post('/api/sections', requireAuth, asyncRoute(async (request, response) => {
  const name = typeof request.body.name === 'string' ? request.body.name.trim() : ''
  if (!validText(name, 1, 60)) return response.status(400).json({ error: 'Section name must be between 1 and 60 characters.' })
  if (!await findUserById(request.userId)) {
    return response.status(401).json({ error: 'Your account is no longer available. Please sign in again.' })
  }
  const section = {
    id: randomUUID(),
    userId: request.userId,
    name,
    createdAt: new Date().toISOString(),
  }
  await createSection(section)
  return response.status(201).json({ section })
}))

app.post('/api/sections/:sectionId/todos', requireAuth, asyncRoute(async (request, response) => {
  const { title, description = '', status = 'pending' } = request.body
  if (!validText(title, 1, 120)) return response.status(400).json({ error: 'Task name must be between 1 and 120 characters.' })
  if (typeof description !== 'string' || description.length > 2000) {
    return response.status(400).json({ error: 'Description must be 2,000 characters or fewer.' })
  }
  if (!validStatuses.has(status)) return response.status(400).json({ error: 'Choose a valid task status.' })
  const section = await findOwnedSection(request.params.sectionId, request.userId)
  if (!section) return response.status(404).json({ error: 'Section not found.' })
  const now = new Date().toISOString()
  const todo = {
    id: randomUUID(),
    sectionId: section.id,
    title: title.trim(),
    description: description.trim(),
    status,
    enteredCurrentStatusAt: now,
    durations: { pending: 0, inReview: 0, done: 0 },
    createdAt: now,
    updatedAt: now,
    sectionName: section.name,
  }
  await createTodo(todo)
  return response.status(201).json({ todo })
}))

app.patch('/api/todos/:todoId', requireAuth, asyncRoute(async (request, response) => {
  const { status } = request.body
  if (!validStatuses.has(status)) return response.status(400).json({ error: 'Choose a valid task status.' })
  const todo = await updateOwnedTodoStatus(request.params.todoId, request.userId, status)
  if (!todo) return response.status(404).json({ error: 'Task not found.' })
  return response.json({ todo })
}))

app.delete('/api/todos/:todoId', requireAuth, asyncRoute(async (request, response) => {
  const deleted = await deleteOwnedTodo(request.params.todoId, request.userId)
  if (!deleted) return response.status(404).json({ error: 'Task not found.' })
  return response.status(204).end()
}))

app.use('/api', (request, response) => response.status(404).json({ error: 'API endpoint not found.' }))
app.use((error, request, response, next) => {
  if (response.headersSent) return next(error)
  if (error instanceof SyntaxError && 'body' in error) {
    return response.status(400).json({ error: 'Request body must contain valid JSON.' })
  }
  console.error(error)
  return response.status(500).json({ error: 'The server could not complete your request.' })
})

await connectToDatabase()
app.listen(port, () => {
  console.log(`Daymark API is running at http://localhost:${port}`)
})
