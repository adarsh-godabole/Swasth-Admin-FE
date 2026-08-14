import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './routes/LoginPage';
import { MembersPage } from './routes/MembersPage';
import { MemberDetailPage } from './routes/MemberDetailPage';
import { RegisterMemberPage } from './routes/RegisterMemberPage';
import { NotStaffPage } from './routes/NotStaffPage';
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
            <Navigate to={isStaff ? '/members' : '/'} replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route element={<RequireStaff />}>
        <Route path="/members" element={<MembersPage />} />
        <Route path="/members/new" element={<RegisterMemberPage />} />
        <Route path="/members/:id" element={<MemberDetailPage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/renewals" element={<RenewalsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/members" replace />} />
    </Routes>
  );
}
