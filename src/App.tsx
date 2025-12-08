import { useAuthStore } from './store/auth-store'
import { LoginScreen } from './components/layout/LoginScreen'
import { MainLayout } from './components/layout/MainLayout'

function App() {
  const { isAuthenticated } = useAuthStore()

  return (
    <div className="h-screen bg-background text-foreground">
      {isAuthenticated ? <MainLayout /> : <LoginScreen />}
    </div>
  )
}

export default App
