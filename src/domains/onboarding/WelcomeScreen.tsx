import { useNavigate } from 'react-router-dom'

export function WelcomeScreen() {
  const navigate = useNavigate()

  return (
    <div className="screen">
      <div className="content content-center grow">
        <h1 style={{ fontSize: '2.6rem', margin: 0 }}>📚 Spelling Practice</h1>
        <p className="muted" style={{ fontSize: '1.2rem', maxWidth: 420 }}>
          Make spelling practice easier.
        </p>
        <p className="muted" style={{ maxWidth: 420 }}>
          Upload this week's words and let your child practice independently.
        </p>

        <div className="stack" style={{ width: '100%', maxWidth: 360, marginTop: 24 }}>
          <button className="btn btn-primary btn-big" onClick={() => navigate('/add-child')}>
            Try it Free
          </button>
          <button className="btn btn-outline" onClick={() => navigate('/sign-in')}>
            Sign In
          </button>
        </div>
      </div>
    </div>
  )
}
