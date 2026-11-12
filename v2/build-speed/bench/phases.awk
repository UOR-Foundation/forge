# Collapses sample lines "<unix s> <tool> <args>" into phases: start offset, length, tool, first args.
NR==1 { t0=$1 }
{ tool=$2; if (tool!=cur) { if (cur!="") printf "%5d %5d %-14s %s\n", s-t0, last-s+1, cur, a; cur=tool; s=$1; a=substr($0, index($0,$3)) } last=$1 }
END { printf "%5d %5d %-14s %s\n", s-t0, last-s+1, cur, a; print "total", last-t0+1 }
