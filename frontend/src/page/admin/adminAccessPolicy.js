export function shouldRedirectToAdminLogin({ canAccess, isForbidden }) {
    return isForbidden;
}
