/**
 * LightNVR Web Interface Header Component
 * Preact component for the site header
 */

import { useState, useEffect, useCallback } from 'preact/hooks';
import {VERSION} from '../../version.js';
import { fetchJSON } from '../../query-client.js';
import { getSettings } from '../../utils/settings-utils.js';
import { showStatusMessage } from './ToastContainer.jsx';
import { EditUserModal } from './users/EditUserModal.jsx';
import { getAuthHeaders, isDemoMode, validateSession } from '../../utils/auth-utils.js';
import { forceNavigation } from '../../utils/navigation-utils.js';
import { useI18n } from '../../i18n.js';
import LanguageSelector from './common/LanguageSelector.jsx';

const navIcons = {
  'nav-live': (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4.75 6.75A2 2 0 0 1 6.75 4.75h10.5a2 2 0 0 1 2 2v10.5a2 2 0 0 1-2 2H6.75a2 2 0 0 1-2-2V6.75Zm3 3.25 3.25 2-3.25 2v-4Zm7.25-1.25h2.25m-2.25 3.25h2.25m-2.25 3.25h2.25" />
  ),
  'nav-recordings': (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M6.75 5.25h10.5a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H6.75a2 2 0 0 1-2-2v-9.5a2 2 0 0 1 2-2Zm.75 3.5h9m-9 3.25h5.25m-5.25 3.25h7.25" />
  ),
  'nav-streams': (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M5 8.25h14M5 15.75h14M8.25 5v6.5m7.5 1V19M8.25 15.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Zm7.5-4.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z" />
  ),
  'nav-settings': (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 8.25a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Zm7.25 3.75a7.7 7.7 0 0 0-.08-1.1l1.45-1.13-1.75-3.03-1.72.7a7.23 7.23 0 0 0-1.9-1.1L15 4.5h-3.5l-.25 1.84c-.68.26-1.32.63-1.9 1.1l-1.72-.7-1.75 3.03 1.45 1.13a7.7 7.7 0 0 0 0 2.2l-1.45 1.13 1.75 3.03 1.72-.7c.58.47 1.22.84 1.9 1.1l.25 1.84H15l.25-1.84c.68-.26 1.32-.63 1.9-1.1l1.72.7 1.75-3.03-1.45-1.13c.05-.36.08-.73.08-1.1Z" />
  ),
  'nav-camera-access': (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7.25 10.25V8.5a4.75 4.75 0 0 1 9.5 0v1.75M6.75 10.25h10.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H6.75a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Zm5.25 3.25v2.25" />
  ),
  'nav-users': (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9.25 11.25a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 7.5a5 5 0 0 1 10 0m.5-13a2.75 2.75 0 0 1 0 5.5m1.75 7.5a4.25 4.25 0 0 0-2.25-3.75" />
  ),
  'nav-system': (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M5.75 7.25a2 2 0 0 1 2-2h8.5a2 2 0 0 1 2 2v5.5a2 2 0 0 1-2 2h-8.5a2 2 0 0 1-2-2v-5.5Zm3.5 11.5h5.5M12 14.75v4m-3.5-9.5h.01m3.49 0h3.5" />
  ),
  'nav-editProfile': (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 12.25a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6.25 6.5a6.25 6.25 0 0 1 12.5 0" />
  ),
  'nav-login': (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M14.25 5.75h2a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-2m-3.5-3 3.25-3.25-3.25-3.25M14 12H5.75" />
  ),
  'nav-logout': (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9.75 5.75h-2a2 2 0 0 0-2 2v8.5a2 2 0 0 0 2 2h2m3.5-3 3.25-3.25-3.25-3.25M18.25 12H10" />
  ),
};

const NavIcon = ({ id }) => (
  <span className="sidebar-nav-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      {navIcons[id] || navIcons['nav-live']}
    </svg>
  </span>
);

const SIDEBAR_STORAGE_KEY = 'oneberry.dashboardSidebar';
const SIDEBAR_EXPANDED_WIDTH_REM = 17;
const SIDEBAR_COLLAPSED_WIDTH_REM = 5.25;
const SIDEBAR_MIN_WIDTH_REM = 14;
const SIDEBAR_MAX_WIDTH_REM = 22;
const SIDEBAR_COLLAPSE_THRESHOLD_REM = 9;

const getStoredSidebarState = () => {
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (!stored) {
      return { collapsed: false, width: SIDEBAR_EXPANDED_WIDTH_REM };
    }

    const parsed = JSON.parse(stored);
    const storedWidth = Number(parsed.width);
    const width = Number.isFinite(storedWidth)
      ? Math.min(SIDEBAR_MAX_WIDTH_REM, Math.max(SIDEBAR_MIN_WIDTH_REM, storedWidth))
      : SIDEBAR_EXPANDED_WIDTH_REM;

    return {
      collapsed: parsed.collapsed === true,
      width,
    };
  } catch (error) {
    return { collapsed: false, width: SIDEBAR_EXPANDED_WIDTH_REM };
  }
};

const buildProfileFormData = (user = {}) => ({
  username: user.username || '',
  password: '',
  email: user.email || '',
  role: user.role_id ?? 1,
  is_active: user.is_active ?? true,
  password_change_locked: user.password_change_locked ?? false,
  allowed_tags: '',
  allowed_login_cidrs: '',
});

/**
 * Header component
 * @param {Object} props - Component props
 * @param {string} props.version - System version
 * @returns {JSX.Element} Header component
 */
export function Header({ version = VERSION }) {
  // Get active navigation from data attribute on header container
  const headerContainer = document.getElementById('header-container');
  const activeNav = headerContainer?.dataset?.activeNav || '';
  const [username, _setUsername] = useState(localStorage.getItem('username') || '');
  const [currentUser, setCurrentUser] = useState(null);
  const [profileFormData, setProfileFormData] = useState(() => buildProfileFormData());
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(true); // Default to true while loading
  const [demoMode, setDemoMode] = useState(false); // Demo mode state
  const [userRole, _setUserRole] = useState(localStorage.getItem('userrole') || null); // null = still loading
  const [sidebarState, setSidebarState] = useState(getStoredSidebarState);
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const { t } = useI18n();
  const sidebarCollapsed = sidebarState.collapsed;

  const setUsername = (username) => {
    _setUsername(username);
    localStorage.setItem('username', username);
  };

  const setUserRole = (userrole) => {
    _setUserRole(userrole);
    localStorage.setItem('userrole', userrole);
  };

  const syncSessionState = useCallback((session) => {
    if (session.valid && session.role) {
      setUserRole(session.role);
    } else {
      setUserRole(session.auth_enabled === false ? 'admin' : 'viewer');
    }

    const isSessionDemoMode = session.demo_mode === true;
    setDemoMode(isSessionDemoMode);

    if (session.username) {
      setUsername(session.username);
    } else {
      setUsername('');
    }

    if (session.id) {
      const nextUser = {
        id: session.id,
        username: session.username || '',
        email: session.email || '',
        role: session.role,
        role_id: session.role_id,
        is_active: session.is_active,
        password_change_locked: session.password_change_locked,
      };
      setCurrentUser(nextUser);
      setProfileFormData(buildProfileFormData(nextUser));
    } else {
      setCurrentUser(null);
      setProfileFormData(buildProfileFormData());
    }
  }, []);

  // Get the current username, role, and check if auth is enabled
  useEffect(() => {
    validateSession()
      .then(syncSessionState)
      .catch(() => {
        setUserRole('viewer');
        if (isDemoMode()) {
          setDemoMode(true);
        } else {
          setUsername('');
        }
      });

    // Fetch settings to check if auth is enabled
    async function checkAuthEnabled() {
      try {
        const settings = await getSettings();
        console.log('Header: Fetched settings:', settings);
        console.log('Header: web_auth_enabled value:', settings.web_auth_enabled);
        const isAuthEnabled = settings.web_auth_enabled === true;
        console.log('Header: Setting authEnabled to:', isAuthEnabled);
        setAuthEnabled(isAuthEnabled);
      } catch (error) {
        console.error('Error fetching auth settings:', error);
        // Default to true on error to avoid hiding logout button unnecessarily
        setAuthEnabled(true);
      }
    }
    checkAuthEnabled();

    // Also check demo mode from global state (set during session validation)
    const checkDemoMode = () => {
      if (window._demoMode === true) {
        setDemoMode(true);
        if (!currentUser?.id) {
          setUsername('');
        }
      }
    };
    // Check initially and also set up a listener for changes
    checkDemoMode();
    // Check periodically in case demo mode was set after initial load
    const intervalId = setInterval(checkDemoMode, 1000);
    // Clean up after first successful detection
    setTimeout(() => clearInterval(intervalId), 5000);
    return () => clearInterval(intervalId);
  }, [currentUser?.id, syncSessionState]);

  useEffect(() => {
    const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH_REM : sidebarState.width;
    document.documentElement.style.setProperty('--dashboard-sidebar-width', `${sidebarWidth}rem`);
    document.body.classList.toggle('dashboard-sidebar-collapsed', sidebarCollapsed);
    document.body.classList.toggle('dashboard-sidebar-dragging', isDraggingSidebar);

    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify({
        collapsed: sidebarCollapsed,
        width: sidebarState.width,
      }));
    } catch (error) {
      // localStorage can fail in private browsing or locked-down embedded views.
    }

    return () => {
      document.body.classList.remove('dashboard-sidebar-dragging');
    };
  }, [isDraggingSidebar, sidebarCollapsed, sidebarState.width]);

  const handleProfileInputChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setProfileFormData(prevData => ({
      ...prevData,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }, []);

  const openProfileModal = useCallback(() => {
    if (!currentUser?.id) {
      return;
    }

    setProfileFormData(buildProfileFormData(currentUser));
    setIsProfileModalOpen(true);
    setMobileMenuOpen(false);
  }, [currentUser]);

  const closeProfileModal = useCallback(() => {
    setIsProfileModalOpen(false);
  }, []);

  const handleProfileSave = useCallback(async (e) => {
    if (e) {
      e.preventDefault();
    }

    if (!currentUser?.id || isSavingProfile) {
      return;
    }

    setIsSavingProfile(true);
    try {
      const payload = {
        username: profileFormData.username.trim(),
        email: profileFormData.email.trim(),
      };
      if (profileFormData.password) {
        payload.password = profileFormData.password;
      }
      const updatedUser = await fetchJSON(`/api/auth/users/${currentUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
        timeout: 15000,
        retries: 1,
        retryDelay: 1000,
      });

      const nextUser = {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email || '',
        role: currentUser.role,
        role_id: updatedUser.role,
        is_active: updatedUser.is_active,
        password_change_locked: updatedUser.password_change_locked,
      };

      setCurrentUser(nextUser);
      setProfileFormData(buildProfileFormData(nextUser));
      setUsername(updatedUser.username);
      setIsProfileModalOpen(false);
      showStatusMessage(t('auth.profileUpdated'), 'success', 5000);
    } catch (error) {
      console.error('Error updating current user:', error);
      showStatusMessage(t('auth.profileUpdateError', { message: error.message }), 'error', 8000);
    } finally {
      setIsSavingProfile(false);
    }
  }, [currentUser, isSavingProfile, profileFormData.email, profileFormData.password, profileFormData.username, t]);

  // Toggle mobile menu
  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarState((prevState) => ({
      collapsed: !prevState.collapsed,
      width: Math.min(SIDEBAR_MAX_WIDTH_REM, Math.max(SIDEBAR_MIN_WIDTH_REM, prevState.width || SIDEBAR_EXPANDED_WIDTH_REM)),
    }));
  }, []);

  const handleSidebarDragStart = useCallback((event) => {
    if (window.innerWidth < 1024) {
      return;
    }

    event.preventDefault();
    setIsDraggingSidebar(true);

    const getRootFontSize = () => parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;

    const handlePointerMove = (moveEvent) => {
      const nextWidthRem = moveEvent.clientX / getRootFontSize();

      if (nextWidthRem <= SIDEBAR_COLLAPSE_THRESHOLD_REM) {
        setSidebarState((prevState) => ({
          ...prevState,
          collapsed: true,
        }));
        return;
      }

      setSidebarState({
        collapsed: false,
        width: Math.min(SIDEBAR_MAX_WIDTH_REM, Math.max(SIDEBAR_MIN_WIDTH_REM, Number(nextWidthRem.toFixed(2)))),
      });
    };

    const stopDragging = () => {
      setIsDraggingSidebar(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
  }, []);

  // Special handling for Live View link to handle both index.html and root URL
  const getLiveViewHref = () => {
    // Check if we're on the root URL or index.html
    const isRoot = window.location.pathname === '/' || window.location.pathname.endsWith('/');

    // If we're on the root URL, stay on the root URL
    if (isRoot) {
      return './';
    }

    // Otherwise, default to index.html
    return 'index.html';
  };

  // Determine if the current user has admin access for nav filtering.
  // While the role is still loading (null) we conservatively show all items
  // so the nav doesn't flash/reorder after load.
  const isAdmin = userRole === null || userRole === 'admin';
  const canEditCurrentUser = authEnabled && !demoMode && Boolean(currentUser?.id);
  const displayUsername = username || (demoMode ? t('auth.demoViewer') : t('auth.user'));

  // Navigation items - don't preserve query parameters when navigating via header
  // Admin-only tabs (System, Users) are hidden from non-admin roles.
  const navItems = [
    { id: 'nav-live', href: getLiveViewHref(), label: t('nav.live') },
    { id: 'nav-recordings', href: 'recordings.html', label: t('nav.recordings') },
    { id: 'nav-streams', href: 'streams.html', label: t('nav.streams') },
    { id: 'nav-settings', href: 'settings.html', label: t('nav.settings') },
    ...(isAdmin ? [{ id: 'nav-camera-access', href: 'camera-access.html', label: t('nav.cameraAccess') }] : []),
    ...(isAdmin ? [{ id: 'nav-users', href: 'users.html', label: t('nav.users') }] : []),
    ...(isAdmin ? [{ id: 'nav-system', href: 'system.html', label: t('nav.system') }] : []),
  ];

  // Render navigation item
  const renderNavItem = (item, mobile = false) => {
    const isActive = activeNav === item.id;
    const baseClasses = "sidebar-nav-link no-underline cursor-pointer border-0 font-medium " + (item.baseClasses || "");
    const activeClass = isActive ? 'is-active' : '';

    const isDisabled = item.disabled === true;
    return (
        <li className={item.classNameLi || ""}>
          <a
              href={isDisabled ? undefined : item.href}
              id={item.id}
              title={item.title || item.label}
              aria-disabled={isDisabled || undefined}
              className={`${baseClasses} ${mobile ? 'is-mobile' : ''} ${activeClass}${isDisabled ? ' is-disabled' : ''}`}
              onClick={(e) => {
                if (isDisabled) return;

                // Force navigation and prevent default behavior
                if (item.href) {
                  forceNavigation(item.href, e);
                }

                // Call onClick function if provided
                if (item.onClick) {
                  item.onClick(e);
                }

                // Close mobile menu if open
                if (mobileMenuOpen) {
                  toggleMobileMenu();
                }
              }}
          >
            <NavIcon id={item.id} />
            <span className="sidebar-nav-label">{item.label}</span>
          </a>
        </li>
    );
  };

  const renderUsername = (mobile = false) => {
    return renderNavItem({
      id: 'nav-editProfile',
      title: t('auth.editProfile'),
      disabled: !canEditCurrentUser,
      onClick: openProfileModal,
      label: displayUsername,
    }, mobile);
  };

  const renderLoginLogout = (login = false, mobile = false) => {
    return renderNavItem({
      id: login ? 'nav-login' : 'nav-logout',
      href: login ? "/login.html" : "/logout",
      label: login ? t('auth.login') : t('auth.logout'),
      baseClasses: (mobile ? 'text-right ' : '') + (login ? 'login-link' : 'logout-link'),
    }, mobile);
  };

  return (
      <>
      <header className={`app-header dashboard-sidebar ${mobileMenuOpen ? 'is-mobile-open' : ''} ${sidebarCollapsed ? 'is-collapsed' : ''} ${isDraggingSidebar ? 'is-resizing' : ''}`}>
        <div className="sidebar-brand-row">
          <div className="logo sidebar-brand">
            <span className="sidebar-brand-mark">O</span>
            <span className="sidebar-brand-copy">
              <h1>Oneberry</h1>
              <span className="version">v{version}</span>
            </span>
          </div>

          <button
              type="button"
              className="sidebar-collapse-toggle"
              onClick={toggleSidebarCollapsed}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-pressed={sidebarCollapsed}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={sidebarCollapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} />
            </svg>
          </button>

          <button
              className="mobile-menu-toggle"
              onClick={toggleMobileMenu}
              aria-label={t('nav.toggleMenu')}
              aria-expanded={mobileMenuOpen}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 7h16M4 12h16M4 17h16"} />
            </svg>
          </button>
        </div>

        <div className="sidebar-content">
          <nav className="sidebar-main-nav" aria-label="Primary navigation">
            <div className="sidebar-section-label">Workspace</div>
            <ul>
              {navItems.map((navItem) => renderNavItem(navItem, true))}
            </ul>
          </nav>

          <div className="sidebar-account">
            <div className="sidebar-section-label">Account</div>
            <div className="sidebar-account-tools">
              <LanguageSelector mobile={true}/>
              {demoMode && !localStorage.getItem('auth') && (
                <span className="sidebar-demo-badge">{t('auth.demoMode')}</span>
              )}
            </div>
            <ul className="sidebar-user-actions">
              {renderUsername(true)}
              {authEnabled && (
                demoMode && !localStorage.getItem('auth') ? renderLoginLogout(true, true) : renderLoginLogout(false, true)
              )}
            </ul>
          </div>
        </div>
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize. Drag left to collapse."
          onPointerDown={handleSidebarDragStart}
        />
      </header>
      {isProfileModalOpen && currentUser && (
        <EditUserModal
          currentUser={currentUser}
          formData={profileFormData}
          handleInputChange={handleProfileInputChange}
          handleEditUser={handleProfileSave}
          onClose={closeProfileModal}
          title={t('auth.editProfileTitle')}
          submitLabel={isSavingProfile ? t('common.saving') : t('common.saveChanges')}
          showPasswordField={true}
          showRoleField={false}
          showActiveField={false}
          showPasswordLockField={false}
          showAllowedTagsField={false}
          showAllowedLoginCidrsField={false}
          showClearLoginLockoutButton={false}
        />
      )}
      </>
  );
}
