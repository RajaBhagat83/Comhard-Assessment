const STATUS_DURATION_KEYS = {
  pending: 'pending',
  'in review': 'inReview',
  done: 'done',
}

export function transitionTodoStatus(todo, status, now = Date.now()) {
  if (todo.status === status) return todo

  const previousDurationKey = STATUS_DURATION_KEYS[todo.status]
  const enteredAt = Date.parse(todo.enteredCurrentStatusAt || todo.createdAt || '')
  const elapsedSeconds = Number.isFinite(enteredAt) ? Math.max(0, (now - enteredAt) / 1000) : 0
  const durations = { pending: 0, inReview: 0, done: 0, ...todo.durations }
  if (previousDurationKey) durations[previousDurationKey] += elapsedSeconds

  return {
    ...todo,
    status,
    enteredCurrentStatusAt: new Date(now).toISOString(),
    durations,
    updatedAt: new Date(now).toISOString(),
  }
}

export function getCurrentStatusSeconds(todo, now = Date.now()) {
  const enteredAt = Date.parse(todo.enteredCurrentStatusAt || todo.createdAt || '')
  if (!Number.isFinite(enteredAt)) return 0
  return Math.max(0, (now - enteredAt) / 1000)
}

export function calculateStatusAverage(todos, status, now = Date.now()) {
  const currentTodos = todos.filter((todo) => todo.status === status)
  if (currentTodos.length === 0) return null

  const totalSeconds = currentTodos.reduce(
    (total, todo) => total + getCurrentStatusSeconds(todo, now),
    0,
  )
  return totalSeconds / currentTodos.length
}

export function formatDuration(seconds) {
  const totalSeconds = Math.floor(Math.max(0, Number(seconds) || 0))
  if (totalSeconds < 60) return `${totalSeconds}s`

  const totalMinutes = Math.floor(totalSeconds / 60)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d${hours > 0 ? ` ${hours}h` : ''}`
  if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`
  return `${minutes}m`
}

export function formatLiveDuration(seconds) {
  const totalSeconds = Math.floor(Math.max(0, Number(seconds) || 0))
  if (totalSeconds < 60) return `${totalSeconds}s`

  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds % 60
  return `${minutes}m${remainingSeconds > 0 ? ` ${remainingSeconds}s` : ''}`
}
