FROM prom/prometheus:latest

COPY prometheus.yml /etc/prometheus/prometheus.yml

# Modified datasource to work with a network_mode: host
# Docker DNS: "gossip_node:8088"
# net host: "localhost:8088"
# MacOSX: "host.docker.internal:8088"
ARG GOSSIP_URL=gossip_node:8088
RUN sed -i 's/#GOSSIP_URL/'"$GOSSIP_URL"'/' /etc/prometheus/prometheus.yml
RUN cat /etc/prometheus/prometheus.yml

CMD [ \
  "--config.file=/etc/prometheus/prometheus.yml", \
  "--storage.tsdb.path=/prometheus" \
  ]
