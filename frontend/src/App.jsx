import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCheck,
  ChevronDown, Circle, ClipboardList, Clock3, FolderOpen, FolderPlus,
  Eye, EyeOff, LayoutGrid, ListTodo, LoaderCircle, LogOut, Menu, Moon, MoreHorizontal,
  Plus, Search, Sparkles, Sun, Trash2, X,
} from 'lucide-react'
import { request } from './api.js'
import { calculateStatusAverage, formatDuration, formatLiveDuration, getCurrentStatusSeconds, transitionTodoStatus } from './sla.js'

const STATUS_META = {
  pending: { label: 'To do', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600' },
  'in review': { label: 'In review', dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700' },
  done: { label: 'Done', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700' },
}

const formatDate = () => new Intl.DateTimeFormat('en', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
}).format(new Date())

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'
}

function App() {
  return (
    <BrowserRouter>
      <DaymarkApp />
    </BrowserRouter>
  )
}

function DaymarkApp() {
  const navigate = useNavigate()
  const location = useLocation()
  const [token, setToken] = useState(() => localStorage.getItem('daymark-token'))
  const protectedPathRef = useRef('/dashboard')
  const [theme, setTheme] = useState(() => localStorage.getItem('daymark-theme') || 'light')
  const [user, setUser] = useState(null)
  const [sections, setSections] = useState([])
  const [todos, setTodos] = useState([])
  const [activeSectionId, setActiveSectionId] = useState('all')
  const [authMode, setAuthMode] = useState(() => location.pathname === '/register' ? 'signup' : 'login')
  const [modal, setModal] = useState(null)
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [clockNow, setClockNow] = useState(Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => setClockNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('daymark-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!token) setAuthMode(location.pathname === '/register' ? 'signup' : 'login')
  }, [location.pathname, token])

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 768px)')
    const handleViewportChange = (event) => setSidebarOpen(event.matches)
    desktopQuery.addEventListener('change', handleViewportChange)
    return () => desktopQuery.removeEventListener('change', handleViewportChange)
  }, [])

  useEffect(() => {
    if (token && location.pathname.startsWith('/dashboard')) {
      protectedPathRef.current = `${location.pathname}${location.search}${location.hash}`
    }
  }, [location.hash, location.pathname, location.search, token])

  useEffect(() => {
    if (!token) return undefined

    const protectedPath = protectedPathRef.current
    window.history.pushState({ daymarkAuthenticated: true }, '', protectedPath)

    function keepAuthenticatedUserInApp() {
      if (!localStorage.getItem('daymark-token')) return
      const returnPath = protectedPathRef.current
      window.history.pushState({ daymarkAuthenticated: true }, '', returnPath)
      navigate(returnPath, { replace: true })
    }

    window.addEventListener('popstate', keepAuthenticatedUserInApp)
    return () => window.removeEventListener('popstate', keepAuthenticatedUserInApp)
  }, [navigate, token])

  function toggleTheme() {
    setTheme((current) => current === 'dark' ? 'light' : 'dark')
  }

  const loadWorkspace = useCallback(async (activeToken = token) => {
    if (!activeToken) return
    setLoading(true)
    setError('')
    try {
      const data = await request('/workspace', { token: activeToken })
      setUser(data.user)
      setSections(data.sections)
      setTodos(data.todos)
    } catch (loadError) {
      localStorage.removeItem('daymark-token')
      setToken(null)
      setUser(null)
      setSections([])
      setTodos([])
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (token) loadWorkspace(token)
  }, [token, loadWorkspace])

  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const activeSection = sections.find((section) => section.id === activeSectionId)
  const activeSectionName = activeSectionId === 'all-tasks'
    ? 'All tasks'
    : activeSection?.name || 'Overview'
  const visibleTodos = useMemo(() => {
    const sectionTodos = activeSectionId === 'all' || activeSectionId === 'all-tasks'
      ? todos
      : todos.filter((todo) => todo.sectionId === activeSectionId)
    const query = searchQuery.trim().toLowerCase()
    return query
      ? sectionTodos.filter((todo) => `${todo.title} ${todo.description}`.toLowerCase().includes(query))
      : sectionTodos
  }, [activeSectionId, todos, searchQuery])

  const groupedTodos = useMemo(() => ({
    pending: visibleTodos.filter((todo) => todo.status === 'pending'),
    'in review': visibleTodos.filter((todo) => todo.status === 'in review'),
    done: visibleTodos.filter((todo) => todo.status === 'done'),
  }), [visibleTodos])

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const terms = query.split(/\s+/).filter(Boolean)
    return todos
      .filter((todo) => statusFilter === 'all' || todo.status === statusFilter)
      .filter((todo) => {
        if (terms.length === 0) return true
        const searchableText = `${todo.title} ${todo.description} ${todo.sectionName || ''}`.toLowerCase()
        return terms.every((term) => searchableText.includes(term))
      })
      .sort((first, second) => {
        const rank = (todo) => {
          const title = todo.title.toLowerCase()
          if (!query) return 0
          if (title === query) return 0
          if (title.startsWith(query)) return 1
          if (title.includes(query)) return 2
          if (terms.some((term) => title.includes(term))) return 3
          if (terms.some((term) => (todo.sectionName || '').toLowerCase().includes(term))) return 4
          return 5
        }
        return rank(first) - rank(second) || second.createdAt.localeCompare(first.createdAt)
      })
  }, [searchQuery, statusFilter, todos])

  async function handleAuth(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const payload = {
      email: formData.get('email'),
      password: formData.get('password'),
      ...(authMode === 'signup' ? { name: formData.get('name') } : {}),
    }
    setError('')
    setLoading(true)
    try {
      const result = await request(`/auth/${authMode}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      localStorage.setItem('daymark-token', result.token)
      setToken(result.token)
      setUser(result.user)
      navigate('/dashboard', { replace: true })
      setNotice(authMode === 'signup' ? 'Your workspace is ready.' : 'Welcome back.')
    } catch (authError) {
      setError(authError.message)
      setLoading(false)
    }
  }

  function signOut() {
    localStorage.removeItem('daymark-token')
    setToken(null)
    setUser(null)
    setSections([])
    setTodos([])
    setActiveSectionId('all')
    setSearchQuery('')
    setStatusFilter('all')
    setError('')
    setAuthMode('login')
    navigate('/login', { replace: true })
  }

  async function createSection(name) {
    const result = await request('/sections', {
      method: 'POST',
      token,
      body: JSON.stringify({ name }),
    })
    setSections((current) => [...current, result.section])
    setActiveSectionId(result.section.id)
    setNotice('Section created.')
  }

  async function createTodo(values) {
    const result = await request(`/sections/${values.sectionId}/todos`, {
      method: 'POST',
      token,
      body: JSON.stringify({
        title: values.title,
        description: values.description,
        status: values.status,
      }),
    })
    setTodos((current) => [result.todo, ...current])
    setActiveSectionId(result.todo.sectionId)
    setNotice('Task added to your section.')
  }

  async function updateTodoStatus(todoId, status) {
    setError('')
    const previousTodo = todos.find((todo) => todo.id === todoId)
    if (!previousTodo || previousTodo.status === status) return

    const optimisticTodo = transitionTodoStatus(previousTodo, status)
    setTodos((current) => current.map((todo) => todo.id === todoId ? optimisticTodo : todo))
    try {
      const result = await request(`/todos/${todoId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status }),
      })
      setTodos((current) => current.map((todo) => (
        todo.id === todoId && todo.enteredCurrentStatusAt === optimisticTodo.enteredCurrentStatusAt
          ? result.todo
          : todo
      )))
    } catch (updateError) {
      setTodos((current) => current.map((todo) => (
        todo.id === todoId && todo.enteredCurrentStatusAt === optimisticTodo.enteredCurrentStatusAt
          ? previousTodo
          : todo
      )))
      setError(updateError.message)
    }
  }

  async function deleteTodo(todoId) {
    setError('')
    try {
      await request(`/todos/${todoId}`, { method: 'DELETE', token })
      setTodos((current) => current.filter((todo) => todo.id !== todoId))
      setNotice('Task deleted.')
    } catch (deleteError) {
      setError(deleteError.message)
    }
  }

  function selectSection(sectionId) {
    setActiveSectionId(sectionId)
    setSearchQuery('')
    setStatusFilter('all')
  }

  const authScreen = (
    <AuthScreen
      mode={authMode}
      setMode={(mode) => {
        setAuthMode(mode)
        setError('')
        navigate(mode === 'signup' ? '/register' : '/login')
      }}
      onSubmit={handleAuth}
      error={error}
      loading={loading}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  )

  const dashboardScreen = loading && !user ? (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f8fc] text-slate-500">
        <LoaderCircle className="mr-3 animate-spin" size={20} /> Loading your workspace…
      </div>
  ) : (
    <div className="min-h-screen bg-[#f7f8fc] text-slate-800">
      <div className="app-shell mx-auto flex min-h-screen max-w-[1600px]">
        {sidebarOpen && <div className="sidebar-scrim" aria-hidden="true" />}
        <aside className={`sidebar z-30 flex w-[258px] flex-col border-r border-slate-200/80 bg-white px-5 py-6 ${sidebarOpen ? 'sidebar-visible' : 'sidebar-hidden'}`}>
          <button className="brand flex items-center gap-3 px-2 text-left" onClick={() => selectSection('all')} aria-label="Go to overview">
            <span className="brand-mark grid h-9 w-9 place-items-center rounded-xl text-white"><CheckCheck size={19} strokeWidth={2.5} /></span>
            <span>
              <span className="block text-[16px] font-bold tracking-tight text-slate-900">daymark<span className="text-violet-500">.</span></span>
              <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[.18em] text-slate-400">Work, in focus</span>
            </span>
          </button>

          <div className="mt-10">
            <p className="section-label px-3">Workspace</p>
            <nav className="mt-3 space-y-1">
              <button onClick={() => selectSection('all')} className={`nav-item ${activeSectionId === 'all' ? 'nav-item-active' : ''}`}>
                <LayoutGrid size={17} /><span>Overview</span>
              </button>
              <button onClick={() => selectSection('all-tasks')} className={`nav-item ${activeSectionId === 'all-tasks' ? 'nav-item-active' : ''}`}>
                <ListTodo size={17} /><span>All tasks</span>
                <span className="nav-count">{todos.length}</span>
              </button>
            </nav>
          </div>

          <div className="mt-9 flex items-center justify-between px-3">
            <p className="section-label">Your sections</p>
            <button className="icon-button h-7 w-7" onClick={() => setModal({ type: 'section' })} aria-label="Create section" title="Create section">
              <Plus size={16} />
            </button>
          </div>
          <nav className="mt-2 flex-1 space-y-1 overflow-y-auto">
            {sections.map((section, index) => {
              const count = todos.filter((todo) => todo.sectionId === section.id).length
              return (
                <button
                  key={section.id}
                  onClick={() => selectSection(section.id)}
                  className={`nav-item ${activeSectionId === section.id ? 'nav-item-active' : ''}`}
                >
                  <span className={`section-dot section-color-${index % 5}`} />
                  <span className="truncate">{section.name}</span>
                  {count > 0 && <span className="nav-count">{count}</span>}
                </button>
              )
            })}
            {sections.length === 0 && (
              <div className="mx-3 mt-3 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-xs leading-5 text-slate-400">
                Your sections will show up here.
              </div>
            )}
          </nav>

          <div className="sidebar-bottom mt-6 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-3 rounded-xl px-2 py-2">
              <span className="avatar">{initials(user?.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">{user?.name}</span>
                <span className="block truncate text-xs text-slate-400">{user?.email}</span>
              </span>
              <button className="signout-button shrink-0" onClick={signOut}><LogOut size={15} />Sign out</button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="topbar flex min-h-[76px] flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-200/70 bg-white/75 px-5 py-3 sm:px-8 lg:px-11">
            <div className="flex items-center gap-3">
              <button
                className="icon-button sidebar-toggle"
                onClick={() => setSidebarOpen((open) => !open)}
                aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                aria-expanded={sidebarOpen}
              >
                <Menu size={19} />
              </button>
              <span className="page-location">{activeSectionName}</span>
            </div>
            <label className="search-field topbar-search order-3 w-full md:order-none md:w-auto md:flex-1">
              <Search size={17} className="shrink-0 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search all tasks…"
                aria-label="Search tasks across all sections"
              />
              {searchQuery && <button onClick={() => setSearchQuery('')} aria-label="Clear search"><X size={15} /></button>}
            </label>
            <div className="topbar-actions order-2 flex items-center gap-2 sm:gap-3 md:order-none">
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <button className="primary-button top-create" onClick={() => setModal({ type: 'todo' })} disabled={sections.length === 0}>
                <Plus size={17} strokeWidth={2.3} /><span>New task</span>
              </button>
            </div>
          </header>

          <div className="dashboard-content mx-auto max-w-[1160px] px-5 pb-12 pt-7 sm:px-8 lg:px-10 lg:pt-9">
            <SearchTools
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
            />
            {error && (
              <div className="mb-5 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                <span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button>
              </div>
            )}
            {searchQuery.trim() || statusFilter !== 'all' ? (
              <SearchResults
                query={searchQuery}
                statusFilter={statusFilter}
                todos={searchResults}
                clockNow={clockNow}
                onStatusChange={updateTodoStatus}
                onDeleteTodo={deleteTodo}
              />
            ) : activeSectionId === 'all' ? (
              <Overview
                user={user}
                sections={sections}
                todos={todos}
                onChoose={selectSection}
                onCreateSection={() => setModal({ type: 'section' })}
                onCreateTodo={() => setModal({ type: 'todo' })}
              />
            ) : activeSectionId === 'all-tasks' ? (
              <SectionBoard
                section={{ id: 'all-tasks', name: 'All tasks' }}
                todos={visibleTodos}
                groupedTodos={groupedTodos}
                clockNow={clockNow}
                searchQuery={searchQuery}
                onCreateTodo={() => setModal({ type: 'todo' })}
                onStatusChange={updateTodoStatus}
                onDeleteTodo={deleteTodo}
                onBack={() => selectSection('all')}
              />
            ) : activeSection ? (
              <SectionBoard
                section={activeSection}
                todos={visibleTodos}
                groupedTodos={groupedTodos}
                clockNow={clockNow}
                searchQuery={searchQuery}
                onCreateTodo={() => setModal({ type: 'todo', sectionId: activeSection.id })}
                onStatusChange={updateTodoStatus}
                onDeleteTodo={deleteTodo}
                onBack={() => selectSection('all')}
              />
            ) : (
              <div className="empty-state mx-auto mt-20 max-w-md text-center">
                <div className="empty-icon mx-auto"><FolderOpen size={25} /></div>
                <h2 className="mt-5 text-xl font-semibold text-slate-800">This section is no longer here</h2>
                <button className="secondary-button mt-5" onClick={() => selectSection('all')}>Back to overview</button>
              </div>
            )}
          </div>
        </main>
      </div>

      {notice && <div className="toast"><span className="toast-check"><Check size={14} /></span>{notice}</div>}
      {modal && (
        <Modal
          type={modal.type}
          sections={sections}
          defaultSectionId={modal.sectionId || activeSection?.id}
          onClose={() => setModal(null)}
          onCreateSection={createSection}
          onCreateTodo={createTodo}
        />
      )}
    </div>
  )
  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/dashboard" replace /> : authScreen} />
      <Route path="/register" element={token ? <Navigate to="/dashboard" replace /> : authScreen} />
      <Route path="/dashboard" element={token ? dashboardScreen : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={token ? '/dashboard' : '/login'} replace />} />
    </Routes>
  )
}

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark'
  return (
    <button className="theme-toggle" onClick={onToggle} aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`} title={`Switch to ${isDark ? 'light' : 'dark'} mode`}>
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}

function SearchTools({ statusFilter, onStatusFilterChange }) {
  const filters = [
    { status: 'pending', label: 'In progress', icon: <Circle size={16} /> },
    { status: 'in review', label: 'In review', icon: <Clock3 size={16} /> },
    { status: 'done', label: 'Done', icon: <Check size={16} /> },
  ]

  return (
    <div className="status-toolbar mb-7">
      <div className="status-filter-row" role="group" aria-label="Filter tasks by status">
        <span className="status-filter-caption">Filter</span>
        {filters.map((filter) => (
          <button
            key={filter.status}
            className={`status-filter ${statusFilter === filter.status ? `status-filter-active status-filter-${filter.status.replace(' ', '-')}` : ''}`}
            onClick={() => onStatusFilterChange(statusFilter === filter.status ? 'all' : filter.status)}
            aria-label={`Filter by ${filter.label}`}
            aria-pressed={statusFilter === filter.status}
            title={filter.label}
          >
            {filter.icon}<span>{filter.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function SearchResults({ query, statusFilter, todos, clockNow, onStatusChange, onDeleteTodo }) {
  const heading = query.trim()
    ? 'Search results'
    : `${statusFilter === 'pending' ? 'In progress' : STATUS_META[statusFilter].label} tasks`
  return (
    <section className="search-results">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Across all your sections</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-[-.035em] text-slate-900">{heading}</h1>
        </div>
        <span className="search-result-count">{todos.length} {todos.length === 1 ? 'match' : 'matches'}</span>
      </div>
      {todos.length > 0 ? (
        <div className="search-result-list">
          {todos.map((todo) => (
            <TaskCard key={todo.id} todo={todo} clockNow={clockNow} onStatusChange={onStatusChange} onDelete={onDeleteTodo} />
          ))}
        </div>
      ) : (
        <div className="search-empty">
          <span className="search-empty-icon"><Search size={19} /></span>
          <p className="mt-3 text-sm font-semibold text-slate-700">No matching tasks found</p>
          <p className="mt-1 text-xs text-slate-400">Try another search or status filter.</p>
        </div>
      )}
    </section>
  )
}

function AuthScreen({ mode, setMode, onSubmit, error, loading, theme, onToggleTheme }) {
  const isSignup = mode === 'signup'
  const [showPassword, setShowPassword] = useState(false)
  return (
    <main className="auth-page min-h-screen">
      <div className="auth-layout mx-auto grid min-h-screen max-w-[1240px] items-center px-5 py-10 lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:px-12">
        <div className="auth-theme-toggle"><ThemeToggle theme={theme} onToggle={onToggleTheme} /></div>
        <section className="auth-story hidden lg:block">
          <div className="brand mb-16 flex items-center gap-3 text-left">
            <span className="brand-mark grid h-10 w-10 place-items-center rounded-xl text-white"><CheckCheck size={20} strokeWidth={2.5} /></span>
            <span className="text-lg font-bold tracking-tight text-slate-900">daymark<span className="text-violet-500">.</span></span>
          </div>
          <div className="story-badge"><Sparkles size={14} /> A little more focus, every day</div>
          <h1 className="mt-7 max-w-[540px] text-[56px] font-semibold leading-[1.06] tracking-[-.055em] text-slate-900">
            Make space for<br />your <span className="text-gradient">best work.</span>
          </h1>
          <p className="mt-6 max-w-[390px] text-[16px] leading-7 text-slate-500">
            Keep the moving pieces in one calm place. Plan your work, find your focus, and make progress that feels good.
          </p>
          <div className="preview-card mt-12 max-w-[430px]">
            <div className="flex items-center justify-between">
              <div><p className="text-xs font-medium text-slate-400">TUESDAY · YOUR WEEK</p><p className="mt-1 text-sm font-semibold text-slate-800">A clear head, a clear plan.</p></div>
              <span className="preview-spark"><Sparkles size={17} /></span>
            </div>
            <div className="mt-6 space-y-3">
              <div className="preview-task"><span className="preview-check"><Check size={12} /></span><span className="line-through">Send the first draft</span><span className="status-mini status-done">Done</span></div>
              <div className="preview-task"><span className="preview-circle" /><span>Shape the launch plan</span><span className="status-mini status-review">In review</span></div>
              <div className="preview-task"><span className="preview-circle" /><span>Make room for a break</span><span className="status-mini status-todo">To do</span></div>
            </div>
          </div>
          <p className="mt-8 text-xs text-slate-400">A thoughtful little home for everything on your list.</p>
        </section>

        <section className="auth-panel mx-auto w-full max-w-[440px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="brand-mark grid h-9 w-9 place-items-center rounded-xl text-white"><CheckCheck size={18} /></span>
            <span className="font-bold tracking-tight text-slate-900">daymark<span className="text-violet-500">.</span></span>
          </div>
          <div className="auth-card">
            <div className="mb-8">
              <p className="auth-eyebrow">{isSignup ? 'A fresh start' : 'Good to see you again'}</p>
              <h2 className="mt-2 text-[30px] font-semibold tracking-[-.04em] text-slate-900">{isSignup ? 'Create your account' : 'Welcome back'}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{isSignup ? 'Your work deserves a space of its own.' : 'Sign in to pick up right where you left off.'}</p>
            </div>

            <div className="auth-tabs mb-6">
              <button className={isSignup ? 'auth-tab auth-tab-active' : 'auth-tab'} onClick={() => setMode('signup')}>Create account</button>
              <button className={!isSignup ? 'auth-tab auth-tab-active' : 'auth-tab'} onClick={() => setMode('login')}>Sign in</button>
            </div>

            {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700" role="alert">{error}</div>}
            <form onSubmit={onSubmit} className="space-y-4">
              {isSignup && (
                <label className="form-label">
                  Your name
                  <input name="name" autoComplete="name" placeholder="e.g. Jamie Parker" required minLength={2} maxLength={80} />
                </label>
              )}
              <label className="form-label">
                Email address
                <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} />
              </label>
              <label className="form-label">
                Password
                <span className="password-field">
                  <input name="password" type={showPassword ? 'text' : 'password'} autoComplete={isSignup ? 'new-password' : 'current-password'} placeholder={isSignup ? 'At least 8 characters' : 'Enter your password'} required minLength={8} maxLength={72} />
                  <button
                    className="password-visibility"
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
              </label>
              <button className="primary-button auth-submit w-full justify-center" type="submit" disabled={loading}>
                {loading ? <LoaderCircle className="animate-spin" size={17} /> : <>{isSignup ? 'Create my account' : 'Sign in'}<ArrowRight size={17} /></>}
              </button>
            </form>
            <p className="mt-6 text-center text-xs leading-5 text-slate-400">By continuing, you agree to keep your work thoughtful and your password private.</p>
          </div>
          <p className="mt-6 text-center text-xs text-slate-400">Simple plans. Steady progress. Your space.</p>
        </section>
      </div>
    </main>
  )
}

function Overview({ user, sections, todos, onChoose, onCreateSection, onCreateTodo }) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const pending = todos.filter((todo) => todo.status === 'pending').length
  const inReview = todos.filter((todo) => todo.status === 'in review').length
  const done = todos.filter((todo) => todo.status === 'done').length

  return (
    <>
      <div className="overview-heading flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">{formatDate()}</p>
          <h1 className="mt-2 text-[34px] font-semibold tracking-[-.045em] text-slate-900 sm:text-[40px]">{greeting}, {user?.name?.split(' ')[0]}<span className="text-violet-500">.</span></h1>
          <p className="mt-2 text-sm text-slate-500">Here’s a little space to make progress on what matters.</p>
        </div>
      </div>

      <div className="stats-grid mt-8 grid gap-3 sm:grid-cols-3">
        <StatCard label="To do" count={pending} icon={<Circle size={17} />} tone="slate" />
        <StatCard label="In review" count={inReview} icon={<Clock3 size={17} />} tone="amber" />
        <StatCard label="Done" count={done} icon={<Check size={17} />} tone="green" />
      </div>

      <div className="section-list-heading mt-10 flex items-end justify-between">
        <div>
          <p className="eyebrow">Make it yours</p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-[-.025em] text-slate-900">Your sections</h2>
        </div>
        {sections.length > 0 && <button className="text-button" onClick={onCreateSection}><Plus size={15} />New section</button>}
      </div>

      {sections.length === 0 ? (
        <div className="first-section-card mt-5 flex flex-col items-center px-6 py-12 text-center sm:py-14">
          <div className="empty-icon"><FolderPlus size={24} /></div>
          <h3 className="mt-5 text-lg font-semibold text-slate-800">Start with a section</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Create a space for a project, a routine, or anything you want to keep moving.</p>
          <button className="primary-button mt-6" onClick={onCreateSection}><Plus size={17} />Create your first section</button>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((section, index) => {
            const sectionTodos = todos.filter((todo) => todo.sectionId === section.id)
            const completed = sectionTodos.filter((todo) => todo.status === 'done').length
            const progress = sectionTodos.length ? Math.round((completed / sectionTodos.length) * 100) : 0
            return (
              <button key={section.id} className="section-card group text-left" onClick={() => onChoose(section.id)}>
                <div className="flex items-start justify-between">
                  <span className={`section-icon section-icon-${index % 5}`}><FolderOpen size={18} /></span>
                  <ArrowUpRight className="mt-1 text-slate-300 transition group-hover:text-violet-500" size={17} />
                </div>
                <h3 className="mt-5 truncate text-[15px] font-semibold text-slate-800">{section.name}</h3>
                <p className="mt-1 text-xs text-slate-400">{sectionTodos.length} {sectionTodos.length === 1 ? 'task' : 'tasks'}</p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                  <span className="text-[11px] font-medium text-slate-400">{progress}%</span>
                </div>
              </button>
            )
          })}
          <button className="add-section-card" onClick={onCreateSection}>
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-dashed border-slate-300 text-slate-400"><Plus size={19} /></span>
            <span className="text-sm font-medium text-slate-500">Add another section</span>
          </button>
        </div>
      )}

      {sections.length > 0 && todos.length === 0 && (
        <div className="mt-8 flex items-center justify-between rounded-2xl bg-violet-50/70 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-violet-500"><ListTodo size={18} /></span>
            <div><p className="text-sm font-semibold text-slate-800">Your first task is one click away</p><p className="mt-0.5 text-xs text-slate-500">Add a task to any section to get started.</p></div>
          </div>
          <button className="text-button hidden sm:flex" onClick={onCreateTodo}>Add task<ArrowRight size={15} /></button>
        </div>
      )}
    </>
  )
}

function StatCard({ label, count, icon, tone }) {
  return (
    <div className="stat-card flex items-center gap-3.5">
      <span className={`stat-icon stat-${tone}`}>{icon}</span>
      <div className="flex-1">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-[22px] font-semibold leading-7 tracking-tight text-slate-900">{count}</p>
      </div>
      <span className="text-xs text-slate-300"><ArrowUpRight size={15} /></span>
    </div>
  )
}

function SectionBoard({ section, todos, groupedTodos, searchQuery, clockNow, onCreateTodo, onStatusChange, onDeleteTodo, onBack }) {
  const [draggedTodoId, setDraggedTodoId] = useState(null)
  const [dropStatus, setDropStatus] = useState(null)
  const [trashActive, setTrashActive] = useState(false)
  const isAllTasks = section.id === 'all-tasks'
  const columns = [
    { key: 'pending', title: 'To do', icon: <Circle size={15} />, tone: 'column-pending' },
    { key: 'in review', title: 'In review', icon: <Clock3 size={15} />, tone: 'column-review' },
    { key: 'done', title: 'Done', icon: <Check size={15} />, tone: 'column-done' },
  ]

  function formatAverageSla(status) {
    if (groupedTodos[status].length === 0) return formatDuration(0)
    const average = calculateStatusAverage(todos, status, clockNow)
    return average === null ? formatDuration(0) : formatDuration(average)
  }

  function handleDrop(event, status) {
    event.preventDefault()
    const todoId = event.dataTransfer.getData('text/plain')
    setDraggedTodoId(null)
    setDropStatus(null)
    const draggedTodo = todos.find((todo) => todo.id === todoId)
    if (draggedTodo && draggedTodo.status !== status) onStatusChange(todoId, status)
  }

  function handleTrashDrop(event) {
    event.preventDefault()
    const todoId = event.dataTransfer.getData('text/plain')
    setDraggedTodoId(null)
    setDropStatus(null)
    setTrashActive(false)
    if (todos.some((todo) => todo.id === todoId)) onDeleteTodo(todoId)
  }

  return (
    <>
      <button className="back-link mb-5" onClick={onBack}><ArrowLeft size={15} />All sections</button>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Your section</p>
          <h1 className="mt-2 text-[34px] font-semibold tracking-[-.045em] text-slate-900 sm:text-[40px]">{section.name}</h1>
          <p className="mt-2 text-sm text-slate-500">{todos.length} {todos.length === 1 ? 'task' : 'tasks'} · Keep the momentum going.</p>
        </div>
      </div>
      {searchQuery && <p className="mt-6 text-sm text-slate-500">Showing results for <span className="font-medium text-slate-700">“{searchQuery}”</span></p>}
      {isAllTasks && (
        <div
          className={`task-trash-zone ${trashActive ? 'task-trash-zone-active' : ''}`}
          role="button"
          aria-label="Drop a task here to delete it"
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('text/plain')) {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setTrashActive(true)
            }
          }}
          onDragLeave={() => setTrashActive(false)}
          onDrop={handleTrashDrop}
        >
          <Trash2 size={17} />
          <span>Drag a task here to delete it</span>
        </div>
      )}
      <div className="board-grid mt-8 grid items-start gap-4 lg:grid-cols-3">
        {columns.map((column) => (
          <section
            key={column.key}
            className={`task-column ${dropStatus === column.key ? 'task-column-drop-active' : ''}`}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes('text/plain')) {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDropStatus(column.key)
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setDropStatus(null)
            }}
            onDrop={(event) => handleDrop(event, column.key)}
          >
            <div className="flex items-start justify-between px-1 pb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={column.tone}>{column.icon}</span>
                  <h2 className="text-[13px] font-semibold text-slate-700">{column.title}</h2>
                  <span className="column-count">{groupedTodos[column.key].length}</span>
                </div>
                <p className="column-sla" title="Average time tasks currently in this status column">
                  <Clock3 size={11} />
                  Avg SLA: {formatAverageSla(column.key)}
                </p>
              </div>
              {column.key === 'pending' && <button className="icon-button h-7 w-7" onClick={onCreateTodo} aria-label="Add task"><Plus size={16} /></button>}
            </div>
            <div className="space-y-3">
              {groupedTodos[column.key].map((todo) => (
                <TaskCard
                  key={todo.id}
                  todo={todo}
                  clockNow={clockNow}
                  onStatusChange={onStatusChange}
                  onDelete={onDeleteTodo}
                  draggable
                  dragging={draggedTodoId === todo.id}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', todo.id)
                    setDraggedTodoId(todo.id)
                  }}
                  onDragEnd={() => {
                    setDraggedTodoId(null)
                    setDropStatus(null)
                  }}
                />
              ))}
              {groupedTodos[column.key].length === 0 && (
                <div className="column-empty">{searchQuery ? 'No matching tasks' : column.key === 'pending' ? 'Nothing on the list yet' : 'Tasks will show up here'}</div>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}

function TaskCard({ todo, clockNow, onStatusChange, onDelete, draggable = false, dragging = false, onDragStart, onDragEnd }) {
  const meta = STATUS_META[todo.status]
  return (
    <article
      className={`task-card ${todo.status === 'done' ? 'task-card-done' : ''} ${draggable ? 'task-card-draggable' : ''} ${dragging ? 'task-card-dragging' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-[13px] font-semibold leading-5 text-slate-800">{todo.title}</h3>
        <div className="group relative -mr-1 -mt-1">
          <button className="icon-button h-7 w-7 opacity-70" aria-label="Task options"><MoreHorizontal size={17} /></button>
          <div className="task-menu">
            <button className="task-menu-delete" onClick={() => onDelete(todo.id)}><Trash2 size={14} />Delete task</button>
          </div>
        </div>
      </div>
      {todo.description && <p className={`mt-2 whitespace-pre-wrap break-words text-xs leading-[1.65] text-slate-500 ${todo.status === 'done' ? 'opacity-70' : ''}`}>{todo.description}</p>}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[10px] text-slate-400"><FolderOpen size={12} />{todo.sectionName}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="task-status-time" title={`Time in ${meta.label}`}>
            <Clock3 size={11} />{formatLiveDuration(getCurrentStatusSeconds(todo, clockNow))}
          </span>
          <label className={`status-select ${meta.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            <select aria-label={`Change status for ${todo.title}`} value={todo.status} onChange={(event) => onStatusChange(todo.id, event.target.value)}>
              <option value="pending">To do</option>
              <option value="in review">In review</option>
              <option value="done">Done</option>
            </select>
            <ChevronDown size={12} />
          </label>
        </div>
      </div>
    </article>
  )
}

function Modal({ type, sections, defaultSectionId, onClose, onCreateSection, onCreateTodo }) {
  const isSection = type === 'section'
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setSubmitting(true)
    setError('')
    try {
      if (isSection) await onCreateSection(formData.get('name'))
      else await onCreateTodo({
        title: formData.get('title'),
        description: formData.get('description'),
        sectionId: formData.get('sectionId'),
        status: formData.get('status'),
      })
      onClose()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="flex items-start justify-between">
          <div>
            <span className="modal-icon">{isSection ? <FolderPlus size={19} /> : <ClipboardList size={19} />}</span>
            <h2 id="modal-title" className="mt-4 text-xl font-semibold tracking-tight text-slate-900">{isSection ? 'Create a section' : 'Create a task'}</h2>
            <p className="mt-1 text-sm text-slate-500">{isSection ? 'Give your work its own little space.' : 'Add the details and choose where it belongs.'}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </div>
        {error && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">{error}</div>}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {isSection ? (
            <label className="form-label">
              Section name
              <input autoFocus name="name" placeholder="e.g. Product launch" required minLength={1} maxLength={60} />
            </label>
          ) : (
            <>
              <label className="form-label">
                Task name
                <input autoFocus name="title" placeholder="What needs to get done?" required minLength={1} maxLength={120} />
              </label>
              <label className="form-label">
                Description <span className="font-normal text-slate-400">(optional)</span>
                <textarea name="description" placeholder="Add a few details to make it clear…" rows={3} maxLength={2000} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="form-label">
                  Section
                  <select name="sectionId" defaultValue={defaultSectionId || sections[0]?.id} required>
                    {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
                  </select>
                </label>
                <label className="form-label">
                  Status
                  <select name="status" defaultValue="pending">
                    <option value="pending">To do</option>
                    <option value="in review">In review</option>
                    <option value="done">Done</option>
                  </select>
                </label>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}
              {isSection ? 'Create section' : 'Add task'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default App
