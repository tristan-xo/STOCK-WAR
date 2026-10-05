# Host Login

The login screen has a dedicated **Host Login** tab.

Set these values in `.env` before starting:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-password
SESSION_SECRET=use-a-long-random-secret
```

The configured admin account is created/updated at server startup. Host login only accepts database accounts with the `admin` role.
