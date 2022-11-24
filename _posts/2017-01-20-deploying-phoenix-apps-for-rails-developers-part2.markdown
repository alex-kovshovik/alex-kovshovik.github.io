---
layout: post
title:  "Deploying Phoenix Apps for Rails developers: Part 2"
date:   2017-01-20 21:00:00 -0700
categories:
---

This is part 2 of the Deploying Phoenix Apps for Rails developers series. In part 1 we created a bare bones Phoenix application and configured it to build and deploy `distillery` releases using `edeliver`. In this post we’re going to deploy an upgrade release and use Erlang’s hot code upgrades.

> The deployed upgrade will be **available immediately, without restarting** your application.

— from [edeliver documentation](https://github.com/boldpoker/edeliver#examples).

- [Deploying Phoenix Apps for Rails developers: Part 1](/2017/01/11/deploying-phoenix-apps-for-rails-developers.html)
- [Edelivered_app version 0.0.1](https://github.com/alex-kovshovik/edelivered_app/tree/0.0.1) - this is the final state of the test app that we built in part 1, feel free to use it as a starting point. You’re going to need to change configuration in `.deliver/config` to point it to your server.

This is how our app looks now:

![Deployed Phoenix App](https://s3.amazonaws.com/shovik-com/uploads/post_images/7/01-deployed-app-before.png?v=63658318751)

## Upgrade releases

Before you continue I strongly encourage you to read [distillery documentation page on upgrades and downgrades](https://hexdocs.pm/distillery/upgrades-and-downgrades.html) and brush up on [edeliver quick start documentation](https://github.com/boldpoker/edeliver#quick-start).

In order to deploy an upgrade, you need to build an “upgrade release”. Unlike regular releases, upgrade releases include [appups](http://erlang.org/doc/man/appup.html) - instructions on how to upgrade a running application from one version to another. When building an upgrade release you must specify the “from” version and the “to” version, so that distillery can generate correct `appups`.

> Release archives in your release store that were created by the build release command **cannot be used to deploy an upgrade**.

Upgrade releases let you deploy changes to your app **without downtime**, which is fantastic, however automatic upgrades won’t work every time because distillery won’t generate correct `Appup` for every possible upgrade scenario, although it usually does an admirable job.

**The plan:**

1. Apply edeliver config workaround.
1. Make a change to our app.
1. Deploy the change.
1. Troubleshooting.
1. Conclusion.

## 1. Apply edeliver config workaround.

As of this writing, [edeliver support of distillery is broken](https://github.com/boldpoker/edeliver/issues/182), but to fix it, all you need to do is to add one line to `:prod` environment configuration in `rel/config.exs`:

```elixir
environment :prod do
  set include_erts: true
  set include_src: false
  set cookie: :"..."
  set output_dir: "rel/edelivered_app" # ADD THIS LINE!!!
end
```

Let’s deploy the change the “old fashioned way”: by building a regular release, deploying it and then running it.

```shell
mix edeliver stop production # Run this if production node is currently running
env MIX_ENV=prod mix edeliver build release production
mix edeliver deploy release to production
mix edeliver start production
```

## 2. Make a change to our app.

First make a few changes to your app and then bump the version in `config/mix.exs` to `0.0.2`. This is important, because we’re going to prepare and deploy an **upgrade release** from version `0.0.1` to version `0.0.2`:

```elixir
def project do
  [app: :edelivered_app,
   version: "0.0.2", # Bump to 0.0.2!
   elixir: "~> 1.4",
   elixirc_paths: elixirc_paths(Mix.env),
   compilers: [:phoenix, :gettext] ++ Mix.compilers,
   build_embedded: Mix.env == :prod,
   start_permanent: Mix.env == :prod,
   aliases: aliases(),
   deps: deps()]
end
```

Commit your changes and tag them:

1. `git commit -am "Steal default Phoenix look to make Edeliver look"`
1. `git tag 0.0.2`

Again, no need to push your commits to a remote git repository (GitHub). Edeliver pushes commits and tags from your `local` git repository to the configured server(s).

## 3. Deploy the change.

Before we deploy the change, let’s make sure `edeliver` can connect to our running node and confirm its version:

```shell
mix edeliver version production
```

You should see this:

![Edeliver output](https://s3.amazonaws.com/shovik-com/uploads/post_images/7/02-mix-edeliver-version-production.png?v=63658353860)

If you receive an error or `edeliver` tells you that the node is not running - head over to the troubleshooting section.

**Ready to build and deploy the upgrade release:**

```shell
mix edeliver upgrade production --from=0.0.1 --to=0.0.2
```

Command output:

![Command output](https://s3.amazonaws.com/shovik-com/uploads/post_images/7/03-mix-edeliver-upgrade-production.png?v=63658353963)

Refresh the page and voilà:

![Updated Phoenix Application](https://s3.amazonaws.com/shovik-com/uploads/post_images/7/04-deployed-app-after.png?v=63658353968)

## 4. Troubleshooting.

Most of the points from the [troubleshooting section of last post](https://shovik.com/blog/6-deploying-phoenix-apps-for-rails-developers#troubleshooting) still apply here. Here are a few specific ones that only apply to upgrades:

- If you’re upgrading your dependencies, hot upgrades might not work. Just do a clean release and restart the node.
- Sometimes edeliver can’t see your node running on the server, even though it’s really running. In that case I had to SSH to each server and kill the Erlang process manually, then start the node: either using edeliver or manually.
- When using `mix edeliver start production` sometimes I got “START SUCCESSFUL” message, but in reality nothing was started. I couldn’t find an explanation for it yet… In this case I just SSH to the server and do it manually.

## 5. Conclusion

The promise of Erlang runtime sounds great: it is a highly reliable system that can run forever and that you could deploy changes to with hot code reloading, without any downtime. This all sounds great, but in my limited experience so far the _go to proper way of deploying Elixir apps_ is highly unreliable - complete opposite of what I expected. As of this writing I deployed about 15 upgrade releases to this website and had problems 1/4 of the time: sometimes even basic text changes _just didn’t take_ LOL.

I’m sure my limited knowledge of Appups, Relups and releases in general is why I’m having all these problems. No worries, I’m going to try to deploy another way.

Tymon Tobolski make some great points in his [blog post about Depoying Phoenix to Production using Docker](http://teamon.eu/2017/deploying-phoenix-to-production-using-docker/):

- Unification: the typical production stack runs several types of applications, not just Elixir. If all of those apps can be deployed the same way - it’s a great win for DevOps.
- Normally production environment doesn’t run on just one server and I like to think of those servers as disposable: if one server goes down - no big deal. Load balancer would quickly stop routing requests to it, some people would lose their websockets connections. That’s not a problem at all - their clients would just re-connect. As long as it doesn’t happen every minute - we’re fine.
- People are excited about Docker and that excitement doesn’t seem to wane, so I’d like to see how docker deployment compares with edeliver deployment: reliability, repeatability.
