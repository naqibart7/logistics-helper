import { createContext, useContext, useState, useEffect } from 'react'

const OnlineContext = createContext({ online: true })

export function OnlineProvider({ children }) {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <OnlineContext.Provider value={{ online }}>
      {children}
    </OnlineContext.Provider>
  )
}

export function useOnline() {
  return useContext(OnlineContext)
}
