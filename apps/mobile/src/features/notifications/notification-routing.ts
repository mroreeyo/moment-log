export interface RouterLike {
  readonly push: (route: string) => void;
}

export interface NotificationResponseLike {
  readonly notification?: {
    readonly request?: {
      readonly content?: {
        readonly data?: Readonly<Record<string, unknown>>;
      };
    };
  };
}

const INTERNAL_ROUTES = new Set(['/camera']);

export const routeFromNotificationResponse = (
  response: NotificationResponseLike,
): string | null => {
  const route = response.notification?.request?.content?.data?.route;
  if (typeof route !== 'string') return null;
  return INTERNAL_ROUTES.has(route) ? route : null;
};

export const createNotificationResponseHandler =
  (router: RouterLike) =>
  (response: NotificationResponseLike): void => {
    const route = routeFromNotificationResponse(response);
    if (route !== null) router.push(route);
  };
