import React from 'react';
import UserManagerView from '@/components/users/UserManagerView';

export const metadata = {
  title: 'Kelola Pengguna & Hak Akses | Dashboard CA & Inventory',
  description: 'Manajemen hak akses Super User, Staff Pusat, dan User Outlet Manager',
};

export default function UsersPage() {
  return <UserManagerView />;
}
