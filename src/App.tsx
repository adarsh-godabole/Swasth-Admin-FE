import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './routes/LoginPage';
import { MembersPage } from './routes/MembersPage';
import { MemberDetailPage } from './routes/MemberDetailPage';
import { RegisterMemberPage } from './routes/RegisterMemberPage';
import { NotStaffPage } from './routes/NotStaffPage';
import { DeskPage } from './routes/DeskPage';
import { DoorCodePage } from './routes/DoorCodePage';
import { InsightsPage } from './routes/InsightsPage';
import { PlansPage } from './routes/PlansPage';
import { RenewalsPage } from './routes/RenewalsPage';

/** Signed in, and holding a staff role — anything else is turned away. */
function RequireStaff() {
  const { isAuthenticated, isStaff } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isStaff) return <NotStaffPage />;
  return <AppLayout />;
}

export function App() {
  const { isAuthenticated, isStaff } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to={isStaff ? '/desk' : '/'} replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route element={<RequireStaff />}>
        <Route path="/members" element={<MembersPage />} />
        <Route path="/members/new" element={<RegisterMemberPage />} />
        <Route path="/members/:id" element={<MemberDetailPage />} />
        <Route path="/desk" element={<DeskPage />} />
        <Route path="/desk/qr" element={<DoorCodePage />} />
        {/* The old check-ins URL is the desk now — keep staff bookmarks working. */}
        <Route path="/check-ins" element={<Navigate to="/desk" replace />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/renewals" element={<RenewalsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/desk" replace />} />
    </Routes>
  );
}
