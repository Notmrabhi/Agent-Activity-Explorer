import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { createQueryClient } from './lib/queryClient'
import ExplorerPage from './pages/ExplorerPage'
import OverviewPage from './pages/OverviewPage'

export default function App() {
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="*" element={<ExplorerPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
