FROM ocaml/opam:debian-13-ocaml-5.5 AS build
USER root
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libgmp-dev libev-dev ca-certificates curl && rm -rf /var/lib/apt/lists/*
USER opam
WORKDIR /home/opam/app
COPY --chown=opam:opam prad_polski.opam prad_polski.opam.locked dune-project ./
RUN opam install . --deps-only --locked --yes
COPY --chown=opam:opam . .
RUN opam exec -- dune build bin/main.exe
FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl libgmp10 libev4t64 && rm -rf /var/lib/apt/lists/* && useradd --system --uid 10001 app
WORKDIR /app
COPY --from=build /home/opam/app/_build/default/bin/main.exe /app/server
RUN mkdir /data && chown app /data
USER app
ENV HOST=0.0.0.0 PORT=8080 DATA_DIR=/data TZ=Europe/Warsaw
EXPOSE 8080
CMD ["/app/server"]
