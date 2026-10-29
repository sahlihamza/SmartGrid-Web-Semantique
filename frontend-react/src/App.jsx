import { lazy, Suspense, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { Header } from './components/Header.jsx'
import { Sidebar } from './components/Sidebar.jsx'
import { PageSkeleton } from './components/Skeleton.jsx'

// Chargement à la demande des pages : recharts et React Flow (lourds) ne sont
// téléchargés que lorsque la page correspondante est ouverte.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const Equipements = lazy(() => import('./pages/Equipements.jsx'))
const IndividuDetail = lazy(() => import('./pages/IndividuDetail.jsx'))
const Reseau = lazy(() => import('./pages/Reseau.jsx'))
const SparqlConsole = lazy(() => import('./pages/SparqlConsole.jsx'))
const Assistant = lazy(() => import('./pages/Assistant.jsx'))

/**
 * Coquille de l'application : barre latérale + en-tête + contenu des pages.
 */
export default function App() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenNav={() => setMobileNavOpen(true)} />

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/equipements" element={<Equipements />} />
              <Route path="/equipements/:name" element={<IndividuDetail />} />
              <Route path="/reseau" element={<Reseau />} />
              <Route path="/sparql" element={<SparqlConsole />} />
              <Route path="/assistant" element={<Assistant />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  )
}
