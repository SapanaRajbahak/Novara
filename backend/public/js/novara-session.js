window.NovaraSession = {
  async fetchCurrentUser() {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        console.warn('[NovaraSession] Failed to fetch current user:', res.status);
        return null;
      }

      const data = await res.json();

      // Support either { user: {...} } or direct user object
      if (data?.user) return data.user;
      return data;
    } catch (err) {
      console.error('[NovaraSession] Error fetching current user:', err);
      return null;
    }
  }
};